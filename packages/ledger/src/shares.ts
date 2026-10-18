import { LedgerError } from './errors';
import { addTo, assertCents, assertUniqueIds, compareIds } from './internal';
import { allocateProportionally, splitEvenly } from './split';
import type { ComputedShares, ExpenseLine, ParticipantId } from './types';

/**
 * Works out each participant's share of an expense:
 * - an item is split equally among the people it's assigned to;
 * - tax, tip and discounts are split in proportion to each person's item subtotal;
 * - leftover cents follow a fixed order (Rule 3).
 * The shares always sum exactly to the expense total.
 *
 * Items for the same set of people are added up before splitting, so rounding happens
 * once per set: three shared items totalling $45.00 give exactly $15.00 each.
 */
export function computeShares(expense: { lines: readonly ExpenseLine[] }): ComputedShares {
  // Item totals per set of people, keyed by the sorted ids.
  const itemGroups = new Map<string, { participantIds: ParticipantId[]; amountCents: number }>();
  let adjustments = 0;

  for (const [index, line] of expense.lines.entries()) {
    assertCents(line.amountCents, `lines[${index}].amountCents`);
    if (line.kind === 'item') {
      if (line.amountCents <= 0) throw new LedgerError(`Item ${index} must be positive`);
      if (line.participantIds.length === 0) throw new LedgerError(`Item ${index} has no people`);
      assertUniqueIds(line.participantIds, `Item ${index}`);
      const participantIds = [...line.participantIds].sort(compareIds);
      const key = JSON.stringify(participantIds);
      const group = itemGroups.get(key) ?? { participantIds, amountCents: 0 };
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
    for (const share of splitEvenly(group.amountCents, group.participantIds)) {
      addTo(subtotals, share.participantId, share.amountCents);
    }
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
