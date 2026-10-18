import { LedgerError } from './errors';
import { assertCents, assertUniqueIds, compareIds } from './internal';
import type { Cents, ParticipantId, Share } from './types';

/**
 * Splits `totalCents` equally. Leftover cents go one each to participants in id order
 * (Rule 3), so $10.00 among three gives 334, 333, 333 every time.
 * Returns shares sorted by participant id.
 */
export function splitEvenly(totalCents: Cents, participantIds: readonly ParticipantId[]): Share[] {
  assertCents(totalCents, 'totalCents');
  if (totalCents < 0) throw new LedgerError('totalCents must not be negative');
  if (participantIds.length === 0) throw new LedgerError('Need at least one participant');
  assertUniqueIds(participantIds, 'participantIds');

  const sorted = [...participantIds].sort(compareIds);
  const base = Math.floor(totalCents / sorted.length);
  const leftover = totalCents - base * sorted.length;
  return sorted.map((participantId, index) => ({
    participantId,
    amountCents: base + (index < leftover ? 1 : 0),
  }));
}

/**
 * Splits `amountCents` (may be negative, for discounts) in proportion to positive `weights`.
 * Each person gets the rounded-down exact share; leftover cents go to the largest
 * remainders, ties broken by participant id. The result sums exactly to `amountCents`.
 */
export function allocateProportionally(
  amountCents: Cents,
  weights: readonly Share[],
): Map<ParticipantId, Cents> {
  const sign = amountCents < 0 ? -1n : 1n;
  const amount = BigInt(Math.abs(amountCents));
  const totalWeight = weights.reduce((sum, w) => sum + BigInt(w.amountCents), 0n);

  // BigInt keeps amount * weight exact even past Number.MAX_SAFE_INTEGER.
  const parts = weights.map((w) => {
    const exact = amount * BigInt(w.amountCents);
    return {
      participantId: w.participantId,
      cents: exact / totalWeight,
      remainder: exact % totalWeight,
    };
  });

  let leftover = amount - parts.reduce((sum, p) => sum + p.cents, 0n);
  const byRemainder = [...parts].sort(
    (a, b) =>
      (a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : 0) ||
      compareIds(a.participantId, b.participantId),
  );
  for (const part of byRemainder) {
    if (leftover === 0n) break;
    part.cents += 1n;
    leftover -= 1n;
  }

  return new Map(parts.map((p) => [p.participantId, Number(sign * p.cents)]));
}
