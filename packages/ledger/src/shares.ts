import { LedgerError } from './errors';
import { addTo, assertCents, assertUniqueIds, compareIds } from './internal';
import { allocateProportionally, splitEvenly } from './split';
import type { ComputedShares, ExpenseLine, ItemLine, ParticipantId, Share } from './types';

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
  // Item totals per set of people and units, keyed by the sorted ids and units.
  const itemGroups = new Map<string, ItemGroup>();
  let adjustments = 0;

  for (const [index, line] of expense.lines.entries()) {
    assertCents(line.amountCents, `lines[${index}].amountCents`);
    if (line.kind === 'item') {
      if (line.amountCents <= 0) throw new LedgerError(`Item ${index} must be positive`);
      if (line.participantIds.length === 0) throw new LedgerError(`Item ${index} has no people`);
      assertUniqueIds(line.participantIds, `Item ${index}`);
      const people = peopleOf(line, index);
      const key = JSON.stringify(people);
      const group = itemGroups.get(key) ?? { ...people, amountCents: 0 };
      group.amountCents += line.amountCents;
      itemGroups.set(key, group);
    } else if (line.kind === 'discount') {
      if (line.amountCents >= 0) throw new LedgerError(`Discount ${index} must be negative`);
      adjustments += line.amountCents;
    } else {
      if (line.amountCents <= 0) throw new LedgerError(`${line.kind} ${index} must be positive`);
      adjustments += line.amountCents;
    }
  }

  if (itemGroups.size === 0) throw new LedgerError('An expense needs at least one item');

  const subtotals = new Map<ParticipantId, number>();
  for (const group of itemGroups.values()) {
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
  }

  const weights = [...subtotals]
    .map(([participantId, amountCents]) => ({ participantId, amountCents }))
    .sort((a, b) => compareIds(a.participantId, b.participantId));
  const itemsTotal = weights.reduce((sum, w) => sum + w.amountCents, 0);
  const totalCents = itemsTotal + adjustments;
  if (totalCents <= 0) throw new LedgerError('Discounts cannot exceed the items total');

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
