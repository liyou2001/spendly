import { LedgerError } from './errors';
import { addTo, assertCents, assertUniqueIds, compareIds } from './internal';
import { allocateProportionally, splitEvenly } from './split';
import type {
  AdjustmentLine,
  Cents,
  ComputedShares,
  ExpenseLine,
  ItemLine,
  ParticipantId,
  Share,
} from './types';

interface ItemGroup {
  participantIds: ParticipantId[];
  /** Matching participantIds, lowest terms; null when everyone has the same number. */
  units: number[] | null;
  amountCents: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The item's people sorted by id with their units, reduced so equal units mean an even split. */
function peopleOf(line: ItemLine, index: number): Omit<ItemGroup, 'amountCents'> {
  if (line.units !== undefined && line.units.length !== line.participantIds.length) {
    throw new LedgerError(`Item ${index} needs one unit count per person`);
  }
  const pairs = line.participantIds
    .map((participantId, i) => ({ participantId, units: line.units?.[i] ?? 1 }))
    .sort((a, b) => compareIds(a.participantId, b.participantId));
  for (const pair of pairs) {
    if (!Number.isSafeInteger(pair.units) || pair.units < 1) {
      throw new LedgerError(`Item ${index} units must be whole numbers of at least 1`);
    }
  }
  const divisor = pairs.reduce((d, pair) => gcd(d, pair.units), 0);
  const units = pairs.map((pair) => pair.units / divisor);
  return {
    participantIds: pairs.map((pair) => pair.participantId),
    units: units.every((u) => u === 1) ? null : units,
  };
}

/** An expense's lines, validated and worked out: the step both functions below share. */
interface Worked {
  groups: (ItemGroup & { lineIndexes: number[]; split: Map<ParticipantId, number> })[];
  /** Each person's item subtotal, sorted by id. */
  weights: Share[];
  itemsTotal: number;
  /** Net tax, tip and discounts. */
  adjustments: number;
  adjustmentIndexes: number[];
}

function work(lines: readonly ExpenseLine[]): Worked {
  // Item totals per set of people and units, keyed by the sorted ids and units.
  const itemGroups = new Map<string, ItemGroup & { lineIndexes: number[] }>();
  let adjustments = 0;
  const adjustmentIndexes: number[] = [];

  for (const [index, line] of lines.entries()) {
    assertCents(line.amountCents, `lines[${index}].amountCents`);
    if (line.kind === 'item') {
      if (line.amountCents <= 0) throw new LedgerError(`Item ${index} must be positive`);
      if (line.participantIds.length === 0) throw new LedgerError(`Item ${index} has no people`);
      assertUniqueIds(line.participantIds, `Item ${index}`);
      const people = peopleOf(line, index);
      const key = JSON.stringify(people);
      const group = itemGroups.get(key) ?? { ...people, amountCents: 0, lineIndexes: [] };
      group.amountCents += line.amountCents;
      group.lineIndexes.push(index);
      itemGroups.set(key, group);
    } else if (line.kind === 'discount') {
      if (line.amountCents >= 0) throw new LedgerError(`Discount ${index} must be negative`);
      adjustments += line.amountCents;
      adjustmentIndexes.push(index);
    } else {
      if (line.amountCents <= 0) throw new LedgerError(`${line.kind} ${index} must be positive`);
      adjustments += line.amountCents;
      adjustmentIndexes.push(index);
    }
  }

  if (itemGroups.size === 0) throw new LedgerError('An expense needs at least one item');

  const subtotals = new Map<ParticipantId, number>();
  const groups = [...itemGroups.values()].map((group) => {
    const split: Share[] = group.units
      ? [
          ...allocateProportionally(
            group.amountCents,
            group.participantIds.map((participantId, i) => ({
              participantId,
              amountCents: group.units?.[i] ?? 1,
            })),
          ),
        ].map(([participantId, amountCents]) => ({ participantId, amountCents }))
      : splitEvenly(group.amountCents, group.participantIds);
    for (const share of split) addTo(subtotals, share.participantId, share.amountCents);
    return { ...group, split: new Map(split.map((s) => [s.participantId, s.amountCents])) };
  });

  const weights = [...subtotals]
    .map(([participantId, amountCents]) => ({ participantId, amountCents }))
    .sort((a, b) => compareIds(a.participantId, b.participantId));
  const itemsTotal = weights.reduce((sum, w) => sum + w.amountCents, 0);
  if (itemsTotal + adjustments <= 0)
    throw new LedgerError('Discounts cannot exceed the items total');
  return { groups, weights, itemsTotal, adjustments, adjustmentIndexes };
}

/**
 * Works out each participant's share of an expense:
 * - an item is split equally among the people it's assigned to, or by their units;
 * - tax, tip and discounts are split in proportion to each person's item subtotal;
 * - leftover cents follow a fixed order (Rule 3).
 * The shares always sum exactly to the expense total.
 *
 * Items for the same people (and units) are added up before splitting, so rounding happens
 * once per set: three shared items totalling $45.00 give exactly $15.00 each.
 */
export function computeShares(expense: { lines: readonly ExpenseLine[] }): ComputedShares {
  const { weights, itemsTotal, adjustments } = work(expense.lines);
  const totalCents = itemsTotal + adjustments;
  const extra = allocateProportionally(adjustments, weights);
  const shares = weights.map((w) => ({
    participantId: w.participantId,
    amountCents: w.amountCents + (extra.get(w.participantId) ?? 0),
  }));

  // Rule 3 must hold; this can only fail if the math above has a bug.
  const sum = shares.reduce((total, s) => total + s.amountCents, 0);
  if (sum !== totalCents) throw new LedgerError(`Shares sum to ${sum}, expected ${totalCents}`);

  return { totalCents, shares };
}

export interface ShareBreakdown {
  /** The person's part of each item line they're on, in line order. */
  items: { lineIndex: number; cents: Cents }[];
  /** Their part of each tax, tip and discount line (discounts negative). */
  adjustments: { lineIndex: number; kind: AdjustmentLine['kind']; cents: Cents }[];
  itemsCents: Cents;
  /** Their items as a fraction of all items, which their tax, tip and discounts follow. */
  percentOfItems: number;
  /** Their share: exactly what computeShares gives them. */
  totalCents: Cents;
}

/**
 * How one person's share was worked out, line by line, for showing it. Each group of items is
 * split as in computeShares, and the person's part is spread over that group's lines in
 * proportion to their amounts. Tax, tip and discounts are each split in proportion to item
 * subtotals; any cent of rounding goes on the largest of them. It adds up exactly to the share.
 */
export function shareBreakdown(
  expense: { lines: readonly ExpenseLine[] },
  participantId: ParticipantId,
): ShareBreakdown {
  const { groups, weights, itemsTotal, adjustments, adjustmentIndexes } = work(expense.lines);
  const lineCents = (index: number) => expense.lines[index]?.amountCents ?? 0;

  const items: ShareBreakdown['items'] = [];
  for (const group of groups) {
    const part = group.split.get(participantId);
    if (part === undefined) continue;
    const byLine = allocateProportionally(
      part,
      group.lineIndexes.map((index) => ({
        participantId: String(index),
        amountCents: lineCents(index),
      })),
    );
    for (const index of group.lineIndexes) {
      items.push({ lineIndex: index, cents: byLine.get(String(index)) ?? 0 });
    }
  }
  items.sort((a, b) => a.lineIndex - b.lineIndex);
  const itemsCents = items.reduce((sum, item) => sum + item.cents, 0);

  const share =
    itemsCents === 0 ? 0 : (allocateProportionally(adjustments, weights).get(participantId) ?? 0);
  const parts = adjustmentIndexes.map((index) => {
    const line = expense.lines[index] as AdjustmentLine;
    const cents =
      itemsCents === 0
        ? 0
        : (allocateProportionally(line.amountCents, weights).get(participantId) ?? 0);
    return { lineIndex: index, kind: line.kind, cents };
  });
  // Rounding each line on its own can be a cent off the share; the largest line takes it.
  const largest = [...parts].sort(
    (a, b) =>
      Math.abs(lineCents(b.lineIndex)) - Math.abs(lineCents(a.lineIndex)) ||
      a.lineIndex - b.lineIndex,
  )[0];
  const off = share - parts.reduce((sum, part) => sum + part.cents, 0);
  if (largest) largest.cents += off;

  return {
    items,
    adjustments: parts,
    itemsCents,
    percentOfItems: itemsTotal === 0 ? 0 : itemsCents / itemsTotal,
    totalCents: itemsCents + share,
  };
}
