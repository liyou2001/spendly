// The Add expense screen's money logic, kept free of React Native so it can be unit tested.
// The math itself lives in packages/ledger; this turns what's typed on screen into ledger input
// and the ledger's output into what save_expense takes.
import {
  computeShares,
  formatAmount,
  formatCents,
  parseCents,
  splitEvenly,
  type Cents,
  type Debt,
  type ExpenseLine,
  type ParticipantId,
  type Share,
} from '@spendly/ledger';

/** Who an item is for, picked from the item's "Who's it for?" dropdown. */
export type Assignment =
  | { kind: 'you' }
  | { kind: 'all' }
  | { kind: 'person'; participantId: ParticipantId }
  | { kind: 'custom'; participantIds: ParticipantId[] }
  /** One tag per unit of a quantity over 1, e.g. 3 × Soft drink: Jeff, Jeff, Maya. */
  | { kind: 'each'; people: ParticipantId[] };

export interface DraftItem {
  /** Stable key for the row while editing. */
  key: string;
  name: string;
  /** The line's total as typed, e.g. "12.34". Parsed with parseCents. */
  amount: string;
  /** How many, as typed, e.g. "3" for "3 × Soft drink". Blank means 1. */
  quantity: string;
  assignment: Assignment;
}

export interface Draft {
  /** "items" splits a receipt line by line; "quick" is just a total. */
  mode: 'items' | 'quick';
  items: DraftItem[];
  /** null when the line hasn't been added. */
  tax: string | null;
  tip: string | null;
  /** Coupons and savings, typed as a positive amount. null when the line hasn't been added. */
  discount: string | null;
  quickTotal: string;
  quickSplit: 'even' | 'amounts';
  quickPeople: ParticipantId[];
  quickAmounts: Record<ParticipantId, string>;
}

export interface SplitPeople {
  /** The signed-in user's participant id in this group. */
  me: ParticipantId;
  /** Everyone in the group, including me, in display order. */
  everyone: readonly ParticipantId[];
}

/** A line as save_expense takes it. A type, not an interface, so it counts as JSON. */
export type SaveItem = {
  name: string;
  amount_cents: Cents;
  kind: 'item' | 'tax' | 'tip' | 'discount';
  participant_ids: ParticipantId[];
  /** Items only, when more than 1. */
  quantity?: number;
  /** Items tagged one by one: each person's number of tags, one per participant id. */
  units?: number[];
};

export interface SplitResult {
  /** null until there's something valid to split. */
  totalCents: Cents | null;
  /** Sorted by participant id. Sums to totalCents when there are no errors. */
  shares: Share[];
  /** Items mode only; quick mode saves no items. */
  items: SaveItem[];
  /**
   * Problems that block saving, keyed by item key, "tax", "tip", "quickTotal",
   * "amount:<participantId>", "quickAmounts" or "form".
   */
  errors: Record<string, string>;
}

/** One choice in an item's "Who's it for?" dropdown. */
export interface AssignmentOption {
  key: string;
  label: string;
  assignment: Assignment;
}

/**
 * The dropdown's choices, in order: Split evenly (everyone, then untick people), You, then each
 * other person. Alone in a group, only You.
 */
export function assignmentOptions(
  people: SplitPeople,
  names: Readonly<Record<ParticipantId, string>>,
): AssignmentOption[] {
  const others = people.everyone.filter((id) => id !== people.me);
  return [
    ...(others.length > 0
      ? [{ key: 'all', label: 'Split evenly', assignment: { kind: 'all' } as const }]
      : []),
    { key: 'you', label: 'You', assignment: { kind: 'you' } as const },
    ...others.map((participantId) => ({
      key: `person:${participantId}`,
      label: names[participantId] ?? 'Someone',
      assignment: { kind: 'person', participantId } as const,
    })),
  ];
}

/** Whether two assignments are the same choice. Everyone or some people evenly is "Split evenly". */
export function sameAssignment(a: Assignment, b: Assignment): boolean {
  // Split evenly starts with everyone; unticking people keeps it the same choice.
  const even = (x: Assignment) => x.kind === 'all' || x.kind === 'custom';
  if (even(a) && even(b)) return true;
  if (a.kind !== b.kind) return false;
  return a.kind !== 'person' || (b.kind === 'person' && a.participantId === b.participantId);
}

/** The participant ids an assignment covers, limited to people in the group. */
export function assignedTo(assignment: Assignment, people: SplitPeople): ParticipantId[] {
  switch (assignment.kind) {
    case 'you':
      return [people.me];
    case 'all':
      return [...people.everyone];
    case 'person':
      return people.everyone.includes(assignment.participantId) ? [assignment.participantId] : [];
    case 'custom':
      return people.everyone.filter((id) => assignment.participantIds.includes(id));
    case 'each':
      return people.everyone.filter((id) => assignment.people.includes(id));
  }
}

/** "Jeff 2, Maya 1", or "4 people" for more than two. */
function unitsLabel(
  units: Readonly<Record<ParticipantId, number>>,
  people: SplitPeople,
  names: Readonly<Record<ParticipantId, string>>,
): string {
  const ids = people.everyone.filter((id) => (units[id] ?? 0) > 0);
  if (ids.length === 0) return 'Pick people';
  if (ids.length > 2) return `${ids.length} people`;
  return ids
    .map((id) => `${id === people.me ? 'You' : (names[id] ?? 'Someone')} ${units[id]}`)
    .join(', ');
}

/** The most units shown as separate tags; larger quantities have one tag for the whole line. */
export const MAX_TAGS = 20;

/**
 * Who each unit of a quantity is for, one tag per unit: "3 × Soft drink" is three tags, which
 * start as You. null when the line has one tag: a quantity of 1 (or over MAX_TAGS), or a line
 * split evenly.
 */
export function tagsFor(
  assignment: Assignment,
  quantity: number | null,
  people: SplitPeople,
): ParticipantId[] | null {
  if (quantity === null || quantity <= 1 || quantity > MAX_TAGS) return null;
  const fill = (id: ParticipantId) => Array.from({ length: quantity }, () => id);
  switch (assignment.kind) {
    case 'each':
      return Array.from({ length: quantity }, (_, i) => assignment.people[i] ?? people.me);
    case 'you':
      return fill(people.me);
    case 'person':
      return fill(assignment.participantId);
    default:
      return null;
  }
}

/**
 * The assignment the line has for its quantity. Tags are kept while the quantity is being
 * retyped, but a line with one tag is for its first tag's person.
 */
export function effectiveAssignment(
  assignment: Assignment,
  quantity: number | null,
  people: SplitPeople,
): Assignment {
  if (assignment.kind !== 'each' || tagsFor(assignment, quantity, people)) return assignment;
  const first = assignment.people[0] ?? people.me;
  return first === people.me ? { kind: 'you' } : { kind: 'person', participantId: first };
}

/** How many tags each person has, e.g. { Jeff: 2, Maya: 1 }. */
function countTags(tags: readonly ParticipantId[]): Record<ParticipantId, number> {
  const counts: Record<ParticipantId, number> = {};
  for (const id of tags) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** A typed quantity: blank is 1; otherwise a whole number from 1 to 999. null if not. */
export function readQuantity(typed: string): number | null {
  const text = typed.trim();
  if (!text) return 1;
  if (!/^\d{1,3}$/.test(text)) return null;
  const quantity = Number(text);
  return quantity >= 1 ? quantity : null;
}

/** The tag's text: "You", "All", a name, or for a custom set "You, Jeff" / "3 people". */
export function assignmentLabel(
  assignment: Assignment,
  people: SplitPeople,
  names: Readonly<Record<ParticipantId, string>>,
): string {
  if (assignment.kind === 'you') return 'You';
  if (assignment.kind === 'all') return 'All';
  if (assignment.kind === 'each') return unitsLabel(countTags(assignment.people), people, names);
  const ids = assignedTo(assignment, people);
  if (ids.length === 0) return 'Pick people';
  if (ids.length > 2) return `${ids.length} people`;
  return ids.map((id) => (id === people.me ? 'You' : (names[id] ?? 'Someone'))).join(', ');
}

/**
 * Labels a saved item's people the same way the tags do: You, All, a name, "3 people", or by
 * count ("Jeff 2, Maya 1") when the units differ.
 */
export function labelForIds(
  participantIds: readonly ParticipantId[],
  people: SplitPeople,
  names: Readonly<Record<ParticipantId, string>>,
  units?: readonly number[],
): string {
  if (units && units.length === participantIds.length && new Set(units).size > 1) {
    return unitsLabel(
      Object.fromEntries(participantIds.map((id, i) => [id, units[i] ?? 1])),
      people,
      names,
    );
  }
  const ids = new Set(participantIds);
  if (ids.size === 1 && ids.has(people.me)) return 'You';
  if (
    ids.size > 1 &&
    ids.size === people.everyone.length &&
    people.everyone.every((id) => ids.has(id))
  ) {
    return 'All';
  }
  return assignmentLabel({ kind: 'custom', participantIds: [...ids] }, people, names);
}

/** Largest amount one line, total or person can hold: $1,000,000.00. */
export const MAX_AMOUNT_CENTS = 100_000_000;

export interface SplitOptions {
  /** The phone's decimal separator. Phones set to e.g. German show "," on the number pad. */
  decimalSeparator: '.' | ',';
}

/**
 * Turns an amount typed with a "," decimal separator into the "." form parseCents reads:
 * "1.234,56" becomes "1234.56". Text typed with "." is left alone.
 */
export function normalizeAmount(text: string, decimalSeparator: '.' | ','): string {
  if (decimalSeparator === '.') return text;
  return text.replace(/\./g, '').replace(',', '.');
}

/** "Enter an amount like 12.34", using the phone's decimal separator. */
function hint(options: SplitOptions, example: string, what = 'an amount'): string {
  return `Enter ${what} like ${example.replace('.', options.decimalSeparator)}`;
}

function readAmount(
  typed: string,
  options: SplitOptions,
  example: string,
  what?: string,
): { ok: true; cents: Cents } | { ok: false; error: string } {
  const cents = parseCents(normalizeAmount(typed, options.decimalSeparator));
  if (cents === null) return { ok: false, error: hint(options, example, what) };
  if (cents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: `Amounts over ${formatCents(MAX_AMOUNT_CENTS)} aren’t supported` };
  }
  return { ok: true, cents };
}

const TOO_LARGE = 'These amounts are too large to split.';

const ADJUSTMENT_NAMES = { tax: 'Tax', tip: 'Tip', discount: 'Discount' } as const;

/** Works out the shares for what's on screen so far. Rows left completely blank are ignored. */
export function buildSplit(
  draft: Draft,
  people: SplitPeople,
  options: SplitOptions = { decimalSeparator: '.' },
): SplitResult {
  try {
    return draft.mode === 'items'
      ? buildItemsSplit(draft, people, options)
      : buildQuickSplit(draft, people, options);
  } catch {
    // The ledger only throws on amounts past what it can hold exactly; the per-amount cap
    // should stop that first. Show it as a form error rather than crash the screen.
    return { totalCents: null, shares: [], items: [], errors: { form: TOO_LARGE } };
  }
}

function buildItemsSplit(draft: Draft, people: SplitPeople, options: SplitOptions): SplitResult {
  const errors: Record<string, string> = {};
  const lines: ExpenseLine[] = [];
  const items: SaveItem[] = [];

  for (const item of draft.items) {
    const name = item.name.trim();
    const typed = item.amount.trim();
    if (!name && !typed) continue;

    if (!typed) {
      errors[item.key] = 'Enter an amount';
      continue;
    }
    const amount = readAmount(typed, options, '12.34');
    if (!amount.ok || amount.cents === 0) {
      // Zero parses fine but isn't a usable amount.
      errors[item.key] = amount.ok ? hint(options, '12.34') : amount.error;
      continue;
    }
    const quantity = readQuantity(item.quantity);
    if (quantity === null) {
      errors[item.key] = 'Enter a quantity from 1 to 999';
      continue;
    }
    // Tagged one by one: each person's units are how many tags they have.
    const assignment = effectiveAssignment(item.assignment, quantity, people);
    const tags = assignment.kind === 'each' ? tagsFor(assignment, quantity, people) : null;
    const participantIds = tags
      ? people.everyone.filter((id) => tags.includes(id))
      : assignedTo(assignment, people);
    if (participantIds.length === 0) {
      errors[item.key] = 'Pick who this is for';
      continue;
    }
    const counts = tags ? countTags(tags) : null;
    const units =
      counts && participantIds.length > 1 ? participantIds.map((id) => counts[id] ?? 0) : undefined;
    // Still counted in the summary; only saving needs the name.
    if (!name) errors[item.key] = 'Name this item';

    lines.push({
      kind: 'item',
      amountCents: amount.cents,
      participantIds,
      ...(units ? { units } : {}),
    });
    items.push({
      name: name || 'Item',
      amount_cents: amount.cents,
      kind: 'item',
      participant_ids: participantIds,
      ...(quantity > 1 ? { quantity } : {}),
      ...(units ? { units } : {}),
    });
  }

  for (const kind of ['tax', 'tip', 'discount'] as const) {
    const typed = draft[kind]?.trim();
    if (!typed) continue;
    const amount = readAmount(typed, options, '1.23');
    if (!amount.ok || amount.cents === 0) {
      errors[kind] = `${amount.ok ? hint(options, '1.23') : amount.error}, or remove the line`;
      continue;
    }
    // Discounts are stored and split as negative lines.
    const cents = kind === 'discount' ? -amount.cents : amount.cents;
    lines.push({ kind, amountCents: cents });
    items.push({
      name: ADJUSTMENT_NAMES[kind],
      amount_cents: cents,
      kind,
      participant_ids: [],
    });
  }

  if (!lines.some((line) => line.kind === 'item')) {
    errors.form = 'Add at least one item';
    return { totalCents: null, shares: [], items: [], errors };
  }
  const itemsCents = lines.reduce((sum, l) => sum + (l.kind === 'item' ? l.amountCents : 0), 0);
  const discountCents = -lines.reduce(
    (sum, l) => sum + (l.kind === 'discount' ? l.amountCents : 0),
    0,
  );
  if (discountCents >= itemsCents) {
    errors.discount = 'The discount has to be less than the items';
    return { totalCents: null, shares: [], items: [], errors };
  }

  const { totalCents, shares } = computeShares({ lines });
  return { totalCents, shares, items, errors };
}

function buildQuickSplit(draft: Draft, people: SplitPeople, options: SplitOptions): SplitResult {
  const errors: Record<string, string> = {};
  const typedTotal = draft.quickTotal.trim();
  if (!typedTotal) {
    errors.quickTotal = 'Enter the total';
    return { totalCents: null, shares: [], items: [], errors };
  }
  const total = readAmount(typedTotal, options, '30.00', 'a total');
  if (!total.ok || total.cents === 0) {
    errors.quickTotal = total.ok ? hint(options, '30.00', 'a total') : total.error;
    return { totalCents: null, shares: [], items: [], errors };
  }

  const included = people.everyone.filter((id) => draft.quickPeople.includes(id));
  if (included.length === 0) {
    errors.form = 'Pick who it’s split between';
    return { totalCents: total.cents, shares: [], items: [], errors };
  }

  if (draft.quickSplit === 'even') {
    return {
      totalCents: total.cents,
      shares: splitEvenly(total.cents, included),
      items: [],
      errors,
    };
  }

  const shares: Share[] = [];
  let assigned = 0;
  for (const participantId of included) {
    const typed = (draft.quickAmounts[participantId] ?? '').trim();
    if (!typed) continue;
    const amount = readAmount(typed, options, '12.34');
    if (!amount.ok) {
      errors[`amount:${participantId}`] = amount.error;
      continue;
    }
    assigned += amount.cents;
    if (amount.cents > 0) shares.push({ participantId, amountCents: amount.cents });
  }
  if (assigned !== total.cents) {
    errors.quickAmounts =
      assigned < total.cents
        ? `${formatCents(total.cents - assigned)} left to assign`
        : `${formatCents(assigned - total.cents)} more than the total`;
  }
  shares.sort((a, b) => (a.participantId < b.participantId ? -1 : 1));
  return { totalCents: total.cents, shares, items: [], errors };
}

/** What each person owes the payer: every share but the payer's own. */
export function owedToPayer(shares: readonly Share[], payer: ParticipantId): Debt[] {
  return shares
    .filter((share) => share.participantId !== payer && share.amountCents > 0)
    .map((share) => ({ from: share.participantId, to: payer, amountCents: share.amountCents }));
}

/**
 * The shares and category as save_expense takes them. The category is the signed-in user's
 * own: on the expense when they paid, otherwise on their own share.
 */
export function savePayload(
  shares: readonly Share[],
  people: SplitPeople,
  payer: ParticipantId,
  categoryId: string | null,
): {
  p_shares: { participant_id: ParticipantId; amount_cents: Cents; category_override_id?: string }[];
  p_category_id: string | null;
} {
  const iPaid = payer === people.me;
  return {
    p_category_id: iPaid ? categoryId : null,
    p_shares: shares.map((share) => ({
      participant_id: share.participantId,
      amount_cents: share.amountCents,
      ...(!iPaid && categoryId && share.participantId === people.me
        ? { category_override_id: categoryId }
        : {}),
    })),
  };
}

/** A saved expense, as the editor needs it to fill in the form again. */
export interface SavedExpense {
  paidBy: ParticipantId;
  merchant: string;
  expenseDate: string;
  totalCents: Cents;
  categoryId: string | null;
  items: {
    name: string;
    amountCents: Cents;
    kind: string;
    participantIds: ParticipantId[];
    quantity: number;
    /** Matching participantIds. */
    units: number[];
  }[];
  shares: { participantId: ParticipantId; amountCents: Cents; categoryOverrideId: string | null }[];
}

export interface EditableExpense {
  draft: Draft;
  merchant: string;
  expenseDate: string;
  paidBy: ParticipantId;
  /** Your category for your share: the expense's if you paid, otherwise your share's. */
  categoryId: string | null;
}

/**
 * The "Who's it for?" choice that matches a saved item's people. A quantity whose units add up
 * to it was tagged one by one, so it comes back as tags (Jeff, Jeff, Maya).
 */
export function assignmentFor(
  participantIds: readonly ParticipantId[],
  people: SplitPeople,
  units?: readonly number[],
  quantity = 1,
): Assignment {
  const sum = units?.reduce((total, n) => total + n, 0);
  if (
    quantity > 1 &&
    participantIds.length > 1 &&
    units?.length === participantIds.length &&
    sum === quantity
  ) {
    return {
      kind: 'each',
      people: people.everyone.flatMap((id) => {
        const count = units[participantIds.indexOf(id)] ?? 0;
        return participantIds.includes(id) ? Array.from({ length: count }, () => id) : [];
      }),
    };
  }
  const ids = new Set(participantIds);
  if (ids.size === 1 && ids.has(people.me)) return { kind: 'you' };
  if (
    ids.size > 1 &&
    ids.size === people.everyone.length &&
    people.everyone.every((id) => ids.has(id))
  ) {
    return { kind: 'all' };
  }
  const [only] = ids;
  if (ids.size === 1 && only) return { kind: 'person', participantId: only };
  return { kind: 'custom', participantIds: people.everyone.filter((id) => ids.has(id)) };
}

/**
 * Fills the Add expense form from a saved expense, for editing. Saving the form then gives the
 * same shares as before unless something is changed.
 */
export function draftFromExpense(
  expense: SavedExpense,
  people: SplitPeople,
  options: SplitOptions = { decimalSeparator: '.' },
): { ok: true; value: EditableExpense } | { ok: false; reason: string } {
  const typed = (cents: Cents) => formatAmount(cents).replace('.', options.decimalSeparator);
  const sum = (kind: string) =>
    expense.items.filter((i) => i.kind === kind).reduce((total, i) => total + i.amountCents, 0);
  const myShare = expense.shares.find((s) => s.participantId === people.me);
  const base = {
    merchant: expense.merchant,
    expenseDate: expense.expenseDate,
    paidBy: expense.paidBy,
    categoryId:
      expense.paidBy === people.me ? expense.categoryId : (myShare?.categoryOverrideId ?? null),
  };
  const empty: Draft = {
    mode: 'items',
    items: [],
    tax: null,
    tip: null,
    discount: null,
    quickTotal: '',
    quickSplit: 'even',
    quickPeople: [...people.everyone],
    quickAmounts: {},
  };

  const lines = expense.items.filter((i) => i.kind === 'item');
  if (lines.length > 0) {
    return {
      ok: true,
      value: {
        ...base,
        draft: {
          ...empty,
          items: lines.map((line, index) => ({
            key: `item-${index}`,
            name: line.name,
            amount: typed(line.amountCents),
            quantity: line.quantity > 1 ? String(line.quantity) : '',
            assignment: assignmentFor(line.participantIds, people, line.units, line.quantity),
          })),
          tax: sum('tax') > 0 ? typed(sum('tax')) : null,
          tip: sum('tip') > 0 ? typed(sum('tip')) : null,
          discount: sum('discount') < 0 ? typed(-sum('discount')) : null,
        },
      },
    };
  }

  // Saved without items: a quick split, evenly or by amount.
  const owing = people.everyone.filter((id) =>
    expense.shares.some((s) => s.participantId === id && s.amountCents > 0),
  );
  const even = splitEvenly(expense.totalCents, owing);
  const isEven = even.every(
    (e) =>
      expense.shares.find((s) => s.participantId === e.participantId)?.amountCents ===
      e.amountCents,
  );
  return {
    ok: true,
    value: {
      ...base,
      draft: {
        ...empty,
        mode: 'quick',
        quickTotal: typed(expense.totalCents),
        quickSplit: isEven ? 'even' : 'amounts',
        quickPeople: owing,
        quickAmounts: isEven
          ? {}
          : Object.fromEntries(expense.shares.map((s) => [s.participantId, typed(s.amountCents)])),
      },
    },
  };
}
