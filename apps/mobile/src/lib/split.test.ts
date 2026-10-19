import { describe, expect, it } from 'vitest';

import {
  assignedTo,
  assignmentLabel,
  assignmentOptions,
  canEditExpense,
  buildSplit,
  draftFromExpense,
  effectiveAssignment,
  MAX_TAGS,
  retag,
  tagsFor,
  toggleEvenSplit,
  labelForIds,
  normalizeAmount,
  owedToPayer,
  sameAssignment,
  savePayload,
  type Assignment,
  type Draft,
  type DraftItem,
  type SplitPeople,
} from './split';

const LEO = 'p-leo';
const JEFF = 'p-jeff';
const MAYA = 'p-maya';
const apartment: SplitPeople = { me: LEO, everyone: [LEO, JEFF, MAYA] };
const names = { [LEO]: 'Leo', [JEFF]: 'Jeff', [MAYA]: 'Maya' };

const draft = (overrides: Partial<Draft> = {}): Draft => ({
  mode: 'items',
  items: [],
  tax: null,
  tip: null,
  discount: null,
  quickTotal: '',
  quickSplit: 'even',
  quickPeople: [LEO, JEFF, MAYA],
  quickAmounts: {},
  ...overrides,
});

let nextKey = 0;
const item = (name: string, amount: string, assignment: Assignment, quantity = ''): DraftItem => ({
  key: `k${nextKey++}`,
  name,
  amount,
  quantity,
  assignment,
});

const you: Assignment = { kind: 'you' };
const all: Assignment = { kind: 'all' };
const maya: Assignment = { kind: 'person', participantId: MAYA };

/** The Costco receipt, typed in the way someone would on the Add expense screen. */
const costco = [
  item('Protein powder', '47.99', you),
  item('Graphic tee', '$12.99', you),
  item('Granola bars', '7.02', you),
  item('Paper towels', '22.99', all),
  item('Dish soap', '11.49', all),
  item('Trash bags', '10.52', all),
  item('Oat milk', '12.49', maya),
  item('Hummus', '8.99', maya),
  item('Veggie chips', '5.52', maya),
];

const amounts = (shares: { participantId: string; amountCents: number }[]) =>
  Object.fromEntries(shares.map((s) => [s.participantId, s.amountCents]));

describe('buildSplit (items)', () => {
  it('splits the Costco receipt: Leo 8300, Jeff 1500, Maya 4200, total 14000', () => {
    const result = buildSplit(draft({ items: costco }), apartment);
    expect(result.errors).toEqual({});
    expect(result.totalCents).toBe(14000);
    expect(amounts(result.shares)).toEqual({ [LEO]: 8300, [JEFF]: 1500, [MAYA]: 4200 });
  });

  it('builds the items save_expense takes, in order', () => {
    const result = buildSplit(draft({ items: costco.slice(0, 4), tax: '1.50' }), apartment);
    expect(result.items).toEqual([
      { name: 'Protein powder', amount_cents: 4799, kind: 'item', participant_ids: [LEO] },
      { name: 'Graphic tee', amount_cents: 1299, kind: 'item', participant_ids: [LEO] },
      { name: 'Granola bars', amount_cents: 702, kind: 'item', participant_ids: [LEO] },
      {
        name: 'Paper towels',
        amount_cents: 2299,
        kind: 'item',
        participant_ids: [LEO, JEFF, MAYA],
      },
      { name: 'Tax', amount_cents: 150, kind: 'tax', participant_ids: [] },
    ]);
  });

  it('takes a discount off in proportion, saved as a negative line', () => {
    const result = buildSplit(draft({ items: costco, discount: '14.00' }), apartment);
    expect(result.totalCents).toBe(12600);
    expect(amounts(result.shares)).toEqual({ [LEO]: 7470, [JEFF]: 1350, [MAYA]: 3780 });
    expect(result.items.at(-1)).toEqual({
      name: 'Discount',
      amount_cents: -1400,
      kind: 'discount',
      participant_ids: [],
    });
  });

  it('refuses a discount as large as the items', () => {
    const result = buildSplit(
      draft({ items: [item('Gum', '1.00', you)], discount: '1.00' }),
      apartment,
    );
    expect(result.errors.discount).toBe('The discount has to be less than the items');
    expect(result.totalCents).toBeNull();
  });

  it('splits tax and tip in proportion and still sums to the total', () => {
    const result = buildSplit(draft({ items: costco, tax: '11.57', tip: '2.00' }), apartment);
    expect(result.totalCents).toBe(15357);
    expect(result.shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(15357);
  });

  it('ignores blank rows and blank tax or tip lines', () => {
    const result = buildSplit(
      draft({ items: [...costco, item('', '', you), item('  ', ' ', all)], tax: '', tip: '  ' }),
      apartment,
    );
    expect(result.errors).toEqual({});
    expect(result.totalCents).toBe(14000);
  });

  it('flags rows that cannot be saved, but still counts unnamed items in the summary', () => {
    const bad = item('Snacks', '12.345', you);
    const noAmount = item('Soda', '', you);
    const zero = item('Free sample', '0', you);
    const unnamed = item('', '5.00', all);
    const nobody = item('Gift', '20', { kind: 'custom', participantIds: [] });
    const result = buildSplit(
      draft({ items: [bad, noAmount, zero, unnamed, nobody], tip: 'abc' }),
      apartment,
    );

    expect(result.errors).toEqual({
      [bad.key]: 'Enter an amount like 12.34',
      [noAmount.key]: 'Enter an amount',
      [zero.key]: 'Enter an amount like 12.34',
      [unnamed.key]: 'Name this item',
      [nobody.key]: 'Pick who this is for',
      tip: 'Enter an amount like 1.23, or remove the line',
    });
    expect(result.totalCents).toBe(500);
  });

  it('needs at least one item, even with tax', () => {
    const result = buildSplit(draft({ tax: '1.00' }), apartment);
    expect(result).toMatchObject({
      totalCents: null,
      shares: [],
      errors: { form: 'Add at least one item' },
    });
  });

  it('puts everything on me in a Personal group', () => {
    const personal: SplitPeople = { me: 'p-solo', everyone: ['p-solo'] };
    const result = buildSplit(
      draft({ items: [item('Textbook', '35', you), item('Pens', '4.50', all)], tax: '2.37' }),
      personal,
    );
    expect(result.shares).toEqual([{ participantId: 'p-solo', amountCents: 4187 }]);
  });
});

describe('quantities and one tag per unit', () => {
  const drinks = (assignment: Assignment, quantity = '3') =>
    draft({ items: [item('Soft drink', '7.50', assignment, quantity)] });
  const each = (...people: string[]): Assignment => ({ kind: 'each', people });

  it('splits 3 × Soft drink $7.50 tagged Jeff, Jeff, Maya by how many tags each has', () => {
    const result = buildSplit(drinks(each(JEFF, MAYA, JEFF)), apartment);
    expect(amounts(result.shares)).toEqual({ [JEFF]: 500, [MAYA]: 250 });
    expect(result.items).toEqual([
      {
        name: 'Soft drink',
        amount_cents: 750,
        kind: 'item',
        participant_ids: [JEFF, MAYA],
        quantity: 3,
        units: [2, 1],
      },
    ]);
  });

  it('starts every tag as You', () => {
    expect(tagsFor(you, 3, apartment)).toEqual([LEO, LEO, LEO]);
    expect(tagsFor(maya, 2, apartment)).toEqual([MAYA, MAYA]);
    expect(tagsFor(all, 3, apartment)).toBeNull();
    expect(tagsFor(you, 1, apartment)).toBeNull();
    expect(tagsFor(you, MAX_TAGS + 1, apartment)).toBeNull();
  });

  it('keeps tags while the quantity is retyped: new ones are You, extra ones are set aside', () => {
    const tagged = each(JEFF, MAYA, JEFF);
    expect(tagsFor(tagged, 4, apartment)).toEqual([JEFF, MAYA, JEFF, LEO]);
    expect(tagsFor(tagged, 2, apartment)).toEqual([JEFF, MAYA]);
    // Back to one, the line is for the first tag's person.
    expect(effectiveAssignment(tagged, 1, apartment)).toEqual({
      kind: 'person',
      participantId: JEFF,
    });
    expect(amounts(buildSplit(drinks(tagged, '1'), apartment).shares)).toEqual({ [JEFF]: 750 });
  });

  it('saves tags that are all one person without units', () => {
    const result = buildSplit(drinks(each(MAYA, MAYA, MAYA)), apartment);
    expect(result.items[0]).toEqual({
      name: 'Soft drink',
      amount_cents: 750,
      kind: 'item',
      participant_ids: [MAYA],
      quantity: 3,
    });
  });

  it('keeps an even split with a quantity, saving the quantity but no units', () => {
    const result = buildSplit(drinks(all, '2'), apartment);
    expect(amounts(result.shares)).toEqual({ [LEO]: 250, [JEFF]: 250, [MAYA]: 250 });
    expect(result.items[0]).toMatchObject({ quantity: 2 });
    expect(result.items[0]).not.toHaveProperty('units');
  });

  it('reads quantities: blank is 1, whole numbers up to 999 only', () => {
    expect(buildSplit(drinks(you, ''), apartment).items[0]).not.toHaveProperty('quantity');
    for (const bad of ['0', '1.5', 'two', '1000', '-2']) {
      expect(Object.values(buildSplit(drinks(you, bad), apartment).errors)).toContain(
        'Enter a quantity from 1 to 999',
      );
    }
  });

  it('labels tags by count', () => {
    expect(assignmentLabel(each(JEFF, MAYA, JEFF), apartment, names)).toBe('Jeff 2, Maya 1');
    expect(assignmentLabel(each(LEO, JEFF, MAYA), apartment, names)).toBe('3 people');
    expect(labelForIds([JEFF, MAYA], apartment, names, [2, 1])).toBe('Jeff 2, Maya 1');
    expect(labelForIds([JEFF, MAYA], apartment, names, [1, 1])).toBe('Jeff, Maya');
  });
});

describe('canEditExpense', () => {
  it('lets the payer or whoever entered it edit, not everyone who can see it', () => {
    const costcoRow = { paidBy: LEO, createdBy: 'u-leo' };
    expect(canEditExpense(costcoRow, LEO, 'u-leo')).toBe(true);
    expect(canEditExpense({ paidBy: JEFF, createdBy: 'u-leo' }, LEO, 'u-leo')).toBe(true);
    expect(canEditExpense(costcoRow, JEFF, 'u-jeff')).toBe(false);
  });
});

describe('tag and Split evenly changes', () => {
  it('retags one unit and keeps the rest', () => {
    expect(retag([LEO, LEO, LEO], 1, JEFF)).toEqual({ kind: 'each', people: [LEO, JEFF, LEO] });
  });

  it('unticks and ticks people in Split evenly, back to All with everyone', () => {
    const withoutLeo = toggleEvenSplit([LEO, JEFF, MAYA], LEO, apartment);
    expect(withoutLeo).toEqual({ kind: 'custom', participantIds: [JEFF, MAYA] });
    expect(toggleEvenSplit([JEFF, MAYA], LEO, apartment)).toEqual({ kind: 'all' });
    expect(toggleEvenSplit([JEFF], JEFF, apartment)).toEqual({
      kind: 'custom',
      participantIds: [],
    });
  });
});

describe('buildSplit (quick)', () => {
  it('splits a total evenly, leftover cents in a fixed order', () => {
    const result = buildSplit(draft({ mode: 'quick', quickTotal: '10' }), apartment);
    expect(result.totalCents).toBe(1000);
    expect(result.shares.map((s) => s.amountCents).sort()).toEqual([333, 333, 334]);
    expect(result.errors).toEqual({});
  });

  it('splits only between the people picked', () => {
    const result = buildSplit(
      draft({ mode: 'quick', quickTotal: '30', quickPeople: [LEO, MAYA] }),
      apartment,
    );
    expect(amounts(result.shares)).toEqual({ [LEO]: 1500, [MAYA]: 1500 });
  });

  it('splits by typed amounts that add up to the total', () => {
    const result = buildSplit(
      draft({
        mode: 'quick',
        quickTotal: '30',
        quickSplit: 'amounts',
        quickAmounts: { [LEO]: '12.50', [JEFF]: '17.50', [MAYA]: '' },
      }),
      apartment,
    );
    expect(result.errors).toEqual({});
    expect(amounts(result.shares)).toEqual({ [LEO]: 1250, [JEFF]: 1750 });
  });

  it('says how much is left, or how much too much, when amounts do not add up', () => {
    const base = { mode: 'quick' as const, quickTotal: '30', quickSplit: 'amounts' as const };
    expect(buildSplit(draft({ ...base, quickAmounts: { [LEO]: '10' } }), apartment).errors).toEqual(
      { quickAmounts: '$20.00 left to assign' },
    );
    expect(
      buildSplit(draft({ ...base, quickAmounts: { [LEO]: '20', [JEFF]: '15' } }), apartment).errors,
    ).toEqual({ quickAmounts: '$5.00 more than the total' });
    expect(
      buildSplit(draft({ ...base, quickAmounts: { [LEO]: 'ten', [JEFF]: '30' } }), apartment)
        .errors,
    ).toEqual({ [`amount:${LEO}`]: 'Enter an amount like 12.34' });
  });

  it('needs a total and at least one person', () => {
    expect(buildSplit(draft({ mode: 'quick' }), apartment).errors).toEqual({
      quickTotal: 'Enter the total',
    });
    expect(buildSplit(draft({ mode: 'quick', quickTotal: '0' }), apartment).errors).toEqual({
      quickTotal: 'Enter a total like 30.00',
    });
    expect(
      buildSplit(draft({ mode: 'quick', quickTotal: '30', quickPeople: [] }), apartment).errors,
    ).toEqual({ form: 'Pick who it’s split between' });
  });
});

describe('item tags', () => {
  it('offer Split evenly, You, then each other person in the dropdown', () => {
    expect(assignmentOptions(apartment, names).map((o) => [o.label, o.assignment])).toEqual([
      ['Split evenly', { kind: 'all' }],
      ['You', { kind: 'you' }],
      ['Jeff', { kind: 'person', participantId: JEFF }],
      ['Maya', { kind: 'person', participantId: MAYA }],
    ]);
  });

  it('offer only You when you are alone in the group', () => {
    expect(assignmentOptions({ me: LEO, everyone: [LEO] }, names).map((o) => o.label)).toEqual([
      'You',
    ]);
  });

  it('match the selected choice, treating any custom set as one choice', () => {
    expect(sameAssignment(maya, { kind: 'person', participantId: MAYA })).toBe(true);
    expect(sameAssignment(maya, { kind: 'person', participantId: JEFF })).toBe(false);
    expect(sameAssignment(all, you)).toBe(false);
    // Split evenly with people left out is still Split evenly.
    expect(sameAssignment(all, { kind: 'custom', participantIds: [JEFF, MAYA] })).toBe(true);
    expect(
      sameAssignment(
        { kind: 'custom', participantIds: [LEO] },
        { kind: 'custom', participantIds: [] },
      ),
    ).toBe(true);
  });

  it('label custom sets by name, or by count above two', () => {
    expect(assignmentLabel({ kind: 'custom', participantIds: [LEO, JEFF] }, apartment, names)).toBe(
      'You, Jeff',
    );
    expect(assignmentLabel({ kind: 'custom', participantIds: [MAYA] }, apartment, names)).toBe(
      'Maya',
    );
    expect(assignmentLabel({ kind: 'custom', participantIds: [] }, apartment, names)).toBe(
      'Pick people',
    );
  });

  it('label saved items the same way', () => {
    expect(labelForIds([LEO], apartment, names)).toBe('You');
    expect(labelForIds([MAYA, JEFF, LEO], apartment, names)).toBe('All');
    expect(labelForIds([JEFF], apartment, names)).toBe('Jeff');
    expect(labelForIds([LEO, MAYA], apartment, names)).toBe('You, Maya');
  });

  it('only cover people still in the group', () => {
    expect(assignedTo({ kind: 'person', participantId: 'gone' }, apartment)).toEqual([]);
    expect(assignedTo({ kind: 'custom', participantIds: [MAYA, 'gone', LEO] }, apartment)).toEqual([
      LEO,
      MAYA,
    ]);
  });
});

describe('owedToPayer', () => {
  it('lists everyone but the payer, skipping zero shares', () => {
    const shares = [
      { participantId: JEFF, amountCents: 1500 },
      { participantId: LEO, amountCents: 8300 },
      { participantId: MAYA, amountCents: 0 },
    ];
    expect(owedToPayer(shares, LEO)).toEqual([{ from: JEFF, to: LEO, amountCents: 1500 }]);
    expect(owedToPayer(shares, JEFF)).toEqual([{ from: LEO, to: JEFF, amountCents: 8300 }]);
  });
});

describe('savePayload', () => {
  const shares = [
    { participantId: JEFF, amountCents: 1500 },
    { participantId: LEO, amountCents: 8300 },
  ];

  it('puts my category on the expense when I paid', () => {
    expect(savePayload(shares, apartment, LEO, 'cat-groceries')).toEqual({
      p_category_id: 'cat-groceries',
      p_shares: [
        { participant_id: JEFF, amount_cents: 1500 },
        { participant_id: LEO, amount_cents: 8300 },
      ],
    });
  });

  it('puts my category on my own share when someone else paid', () => {
    expect(savePayload(shares, apartment, JEFF, 'cat-dining')).toEqual({
      p_category_id: null,
      p_shares: [
        { participant_id: JEFF, amount_cents: 1500 },
        { participant_id: LEO, amount_cents: 8300, category_override_id: 'cat-dining' },
      ],
    });
  });
});

describe('comma decimal separators', () => {
  const comma = { decimalSeparator: ',' as const };

  it('reads amounts typed with a comma, from phones set to e.g. German', () => {
    const result = buildSplit(
      draft({ items: [item('Brot', '12,99', you), item('Kaffee', '1.234,50', all)] }),
      apartment,
      comma,
    );
    expect(result.errors).toEqual({});
    expect(result.totalCents).toBe(1299 + 123450);
  });

  it('words errors with the comma too', () => {
    const bad = item('Brot', '12,345', you);
    expect(buildSplit(draft({ items: [bad] }), apartment, comma).errors[bad.key]).toBe(
      'Enter an amount like 12,34',
    );
  });

  it('leaves dot amounts alone on dot phones', () => {
    expect(normalizeAmount('1,234.50', '.')).toBe('1,234.50');
    expect(normalizeAmount('1.234,50', ',')).toBe('1234.50');
  });
});

describe('very large amounts', () => {
  it('rejects a line over $1,000,000.00 instead of crashing', () => {
    const big = item('Yacht', '9999999999999', you);
    const result = buildSplit(draft({ items: [big] }), apartment);
    expect(result.errors[big.key]).toBe('Amounts over $1,000,000.00 aren’t supported');
    expect(result.totalCents).toBeNull();
  });

  it('allows exactly $1,000,000.00, and caps quick totals and per-person amounts too', () => {
    expect(buildSplit(draft({ items: [item('House', '1000000', you)] }), apartment).errors).toEqual(
      {},
    );
    expect(
      buildSplit(draft({ mode: 'quick', quickTotal: '1000000.01' }), apartment).errors,
    ).toEqual({
      quickTotal: 'Amounts over $1,000,000.00 aren’t supported',
    });
    const byAmount = buildSplit(
      draft({
        mode: 'quick',
        quickTotal: '30',
        quickSplit: 'amounts',
        quickAmounts: { [LEO]: '2000000' },
      }),
      apartment,
    );
    expect(byAmount.errors[`amount:${LEO}`]).toBe('Amounts over $1,000,000.00 aren’t supported');
  });
});

describe('draftFromExpense', () => {
  const save = (d: Draft, payer = LEO, categoryId: string | null = 'cat-groceries') => {
    const result = buildSplit(d, apartment);
    const payload = savePayload(result.shares, apartment, payer, categoryId);
    return {
      paidBy: payer,
      merchant: 'Costco',
      expenseDate: '2026-10-17',
      totalCents: result.totalCents!,
      // What my_category_for returns: the expense's if Leo paid, otherwise his share's.
      myCategoryId:
        payload.p_category_id ??
        payload.p_shares.find((s) => s.participant_id === LEO)?.category_override_id ??
        null,
      items: result.items.map((i) => ({
        name: i.name,
        amountCents: i.amount_cents,
        kind: i.kind,
        participantIds: i.participant_ids,
        quantity: i.quantity ?? 1,
        units: i.units ?? i.participant_ids.map(() => 1),
        byUnits: i.units !== undefined,
      })),
      shares: payload.p_shares.map((s) => ({
        participantId: s.participant_id,
        amountCents: s.amount_cents,
      })),
    };
  };

  it('round-trips the Costco receipt: editing without changes gives the same shares', () => {
    const saved = save(draft({ items: costco, tax: '1.57', tip: '2.00' }));
    const edit = draftFromExpense(saved, apartment);
    if (!edit.ok) throw new Error(edit.reason);
    expect(buildSplit(edit.value.draft, apartment).shares).toEqual(
      buildSplit(draft({ items: costco, tax: '1.57', tip: '2.00' }), apartment).shares,
    );
    expect(edit.value.draft.items.map((i) => i.assignment.kind)).toEqual([
      'you',
      'you',
      'you',
      'all',
      'all',
      'all',
      'person',
      'person',
      'person',
    ]);
    expect(edit.value.draft.tax).toBe('1.57');
    expect(edit.value).toMatchObject({
      merchant: 'Costco',
      paidBy: LEO,
      categoryId: 'cat-groceries',
    });
  });

  it('brings back a custom set and your category on someone else’s expense', () => {
    const saved = save(
      draft({ items: [item('Gift', '30', { kind: 'custom', participantIds: [LEO, MAYA] })] }),
      JEFF,
      'cat-fun',
    );
    const edit = draftFromExpense(saved, apartment);
    if (!edit.ok) throw new Error(edit.reason);
    expect(edit.value.draft.items[0]?.assignment).toEqual({
      kind: 'custom',
      participantIds: [LEO, MAYA],
    });
    expect(edit.value.categoryId).toBe('cat-fun');
  });

  it('reopens quick splits evenly or by amount', () => {
    const even = draftFromExpense(save(draft({ mode: 'quick', quickTotal: '10' })), apartment);
    expect(even.ok && even.value.draft).toMatchObject({
      mode: 'quick',
      quickTotal: '10.00',
      quickSplit: 'even',
      quickPeople: [LEO, JEFF, MAYA],
    });
    const byAmount = draftFromExpense(
      save(
        draft({
          mode: 'quick',
          quickTotal: '30',
          quickSplit: 'amounts',
          quickAmounts: { [LEO]: '12.50', [JEFF]: '17.50' },
        }),
      ),
      apartment,
    );
    expect(byAmount.ok && byAmount.value.draft).toMatchObject({
      quickSplit: 'amounts',
      quickPeople: [LEO, JEFF],
      quickAmounts: { [LEO]: '12.50', [JEFF]: '17.50' },
    });
  });

  it('reopens an even split of 2 × Pizza as Split evenly, not as tags', () => {
    const pizza = draft({
      items: [item('Pizza', '20.00', { kind: 'custom', participantIds: [JEFF, MAYA] }, '2')],
    });
    const edit = draftFromExpense(save(pizza), apartment);
    if (!edit.ok) throw new Error(edit.reason);
    expect(edit.value.draft.items[0]?.assignment).toEqual({
      kind: 'custom',
      participantIds: [JEFF, MAYA],
    });
  });

  it('round-trips tags and quantities', () => {
    const tagged = draft({
      items: [
        item('Soft drink', '7.50', { kind: 'each', people: [MAYA, JEFF, JEFF] }, '3'),
        item('Pizza', '20.00', all, '2'),
        item('Fries', '4.00', you, '2'),
      ],
    });
    const edit = draftFromExpense(save(tagged), apartment);
    if (!edit.ok) throw new Error(edit.reason);
    expect(edit.value.draft.items.map((i) => [i.quantity, i.assignment])).toEqual([
      // Tags come back grouped by person, in the group's order.
      ['3', { kind: 'each', people: [JEFF, JEFF, MAYA] }],
      ['2', { kind: 'all' }],
      ['2', { kind: 'you' }],
    ]);
    expect(buildSplit(edit.value.draft, apartment).shares).toEqual(
      buildSplit(tagged, apartment).shares,
    );
  });

  it('uses the phone’s decimal separator', () => {
    const saved = save(draft({ items: [item('Brot', '2.50', you)] }));
    const comma = draftFromExpense(saved, apartment, { decimalSeparator: ',' });
    expect(comma.ok && comma.value.draft.items[0]?.amount).toBe('2,50');
  });

  it('round-trips a discount', () => {
    const withCoupon = draft({ items: costco, tax: '1.57', discount: '5.00' });
    const edit = draftFromExpense(save(withCoupon), apartment);
    if (!edit.ok) throw new Error(edit.reason);
    expect(edit.value.draft.discount).toBe('5.00');
    expect(buildSplit(edit.value.draft, apartment).shares).toEqual(
      buildSplit(withCoupon, apartment).shares,
    );
  });
});
