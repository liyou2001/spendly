import { describe, expect, it } from 'vitest';

import {
  assignedTo,
  assignmentLabel,
  buildSplit,
  labelForIds,
  nextAssignment,
  normalizeAmount,
  owedToPayer,
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
  quickTotal: '',
  quickSplit: 'even',
  quickPeople: [LEO, JEFF, MAYA],
  quickAmounts: {},
  ...overrides,
});

let nextKey = 0;
const item = (name: string, amount: string, assignment: Assignment): DraftItem => ({
  key: `k${nextKey++}`,
  name,
  amount,
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
  it('cycle You, All, each other person, Custom, then back to You', () => {
    const seen: string[] = [];
    let current: Assignment = you;
    for (let i = 0; i < 6; i++) {
      seen.push(assignmentLabel(current, apartment, names));
      current = nextAssignment(current, apartment);
    }
    expect(seen).toEqual(['You', 'All', 'Jeff', 'Maya', '3 people', 'You']);
  });

  it('skip Custom with two people, and stay on You when alone', () => {
    const pair: SplitPeople = { me: LEO, everyone: [LEO, JEFF] };
    expect(nextAssignment({ kind: 'person', participantId: JEFF }, pair)).toEqual(you);
    expect(nextAssignment(you, { me: LEO, everyone: [LEO] })).toEqual(you);
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
