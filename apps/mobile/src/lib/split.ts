// The Add expense screen's money logic, kept free of React Native so it can be unit tested.
// The math itself lives in packages/ledger; this turns what's typed on screen into ledger input
// and the ledger's output into what save_expense takes.
import {
  computeShares,
  formatCents,
  parseCents,
  splitEvenly,
  type Cents,
  type Debt,
  type ExpenseLine,
  type ParticipantId,
  type Share,
} from '@spendly/ledger';

/** Who an item is for. Tapping an item's tag cycles through these. */
export type Assignment =
  | { kind: 'you' }
  | { kind: 'all' }
  | { kind: 'person'; participantId: ParticipantId }
  | { kind: 'custom'; participantIds: ParticipantId[] };

export interface DraftItem {
  /** Stable key for the row while editing. */
  key: string;
  name: string;
  /** As typed, e.g. "12.34". Parsed with parseCents. */
  amount: string;
  assignment: Assignment;
}

export interface Draft {
  /** "items" splits a receipt line by line; "quick" is just a total. */
  mode: 'items' | 'quick';
  items: DraftItem[];
  /** null when the line hasn't been added. */
  tax: string | null;
  tip: string | null;
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
  kind: 'item' | 'tax' | 'tip';
  participant_ids: ParticipantId[];
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

/** The tag after this one: You, All, each other person, Custom, then back to You. */
export function nextAssignment(current: Assignment, people: SplitPeople): Assignment {
  const others = people.everyone.filter((id) => id !== people.me);
  const cycle: Assignment[] = [{ kind: 'you' }];
  if (others.length > 0) cycle.push({ kind: 'all' });
  for (const participantId of others) cycle.push({ kind: 'person', participantId });
  // With one other person, You / All / them already covers every choice.
  if (others.length > 1) cycle.push({ kind: 'custom', participantIds: [...people.everyone] });

  const index = cycle.findIndex(
    (option) =>
      option.kind === current.kind &&
      (option.kind !== 'person' ||
        (current.kind === 'person' && option.participantId === current.participantId)),
  );
  return cycle[(index + 1) % cycle.length] ?? { kind: 'you' };
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
  }
}

/** The tag's text: "You", "All", a name, or for a custom set "You, Jeff" / "3 people". */
export function assignmentLabel(
  assignment: Assignment,
  people: SplitPeople,
  names: Readonly<Record<ParticipantId, string>>,
): string {
  if (assignment.kind === 'you') return 'You';
  if (assignment.kind === 'all') return 'All';
  const ids = assignedTo(assignment, people);
  if (ids.length === 0) return 'Pick people';
  if (ids.length > 2) return `${ids.length} people`;
  return ids.map((id) => (id === people.me ? 'You' : (names[id] ?? 'Someone'))).join(', ');
}

/** Labels a saved item's people the same way the tags do: You, All, a name, or "3 people". */
export function labelForIds(
  participantIds: readonly ParticipantId[],
  people: SplitPeople,
  names: Readonly<Record<ParticipantId, string>>,
): string {
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
    const participantIds = assignedTo(item.assignment, people);
    if (participantIds.length === 0) {
      errors[item.key] = 'Pick who this is for';
      continue;
    }
    // Still counted in the summary; only saving needs the name.
    if (!name) errors[item.key] = 'Name this item';

    lines.push({ kind: 'item', amountCents: amount.cents, participantIds });
    items.push({
      name: name || 'Item',
      amount_cents: amount.cents,
      kind: 'item',
      participant_ids: participantIds,
    });
  }

  for (const kind of ['tax', 'tip'] as const) {
    const typed = draft[kind]?.trim();
    if (!typed) continue;
    const amount = readAmount(typed, options, '1.23');
    if (!amount.ok || amount.cents === 0) {
      errors[kind] = `${amount.ok ? hint(options, '1.23') : amount.error}, or remove the line`;
      continue;
    }
    lines.push({ kind, amountCents: amount.cents });
    items.push({
      name: kind === 'tax' ? 'Tax' : 'Tip',
      amount_cents: amount.cents,
      kind,
      participant_ids: [],
    });
  }

  if (!lines.some((line) => line.kind === 'item')) {
    errors.form = 'Add at least one item';
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
