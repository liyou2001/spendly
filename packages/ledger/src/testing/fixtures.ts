// Test data shared across the test files. Not exported from index.ts.
import { computeShares } from '../shares';
import type { ExpenseLine, LedgerExpense, LedgerPayment, ParticipantId } from '../types';

export const LEO = 'leo';
export const JEFF = 'jeff';
export const MAYA = 'maya';

/** Leo's $140.00 Costco receipt from the plan. */
export const costcoLines: ExpenseLine[] = [
  // Leo only: $68.00
  { kind: 'item', amountCents: 4799, participantIds: [LEO] }, // protein powder
  { kind: 'item', amountCents: 1299, participantIds: [LEO] }, // graphic tee
  { kind: 'item', amountCents: 702, participantIds: [LEO] }, // granola bars
  // Split 3 ways: $45.00
  { kind: 'item', amountCents: 2299, participantIds: [LEO, JEFF, MAYA] }, // paper towels
  { kind: 'item', amountCents: 1149, participantIds: [LEO, JEFF, MAYA] }, // dish soap
  { kind: 'item', amountCents: 1052, participantIds: [LEO, JEFF, MAYA] }, // trash bags
  // Maya only: $27.00
  { kind: 'item', amountCents: 1249, participantIds: [MAYA] }, // oat milk
  { kind: 'item', amountCents: 899, participantIds: [MAYA] }, // hummus
  { kind: 'item', amountCents: 552, participantIds: [MAYA] }, // veggie chips
];

/** A saved expense built with `computeShares`, the way the app will save one. */
export function expense(
  overrides: Partial<LedgerExpense> & { lines?: ExpenseLine[] } = {},
): LedgerExpense {
  const { lines = costcoLines, ...rest } = overrides;
  return {
    id: 'costco',
    paidBy: LEO,
    expenseDate: '2026-10-17',
    categoryId: 'groceries',
    shares: computeShares({ lines }).shares,
    ...rest,
  };
}

/** An expense where each listed person owes exactly the given amount. */
export function simpleExpense(
  id: string,
  paidBy: ParticipantId,
  owed: Record<ParticipantId, number>,
  extra: Partial<LedgerExpense> = {},
): LedgerExpense {
  return {
    id,
    paidBy,
    expenseDate: '2026-10-01',
    categoryId: 'dining',
    shares: Object.entries(owed).map(([participantId, amountCents]) => ({
      participantId,
      amountCents,
    })),
    ...extra,
  };
}

export function payment(
  from: ParticipantId,
  to: ParticipantId,
  amountCents: number,
  status: LedgerPayment['status'] = 'confirmed',
): LedgerPayment {
  return { kind: 'payment', from, to, amountCents, status };
}

export function forgiveness(
  from: ParticipantId,
  to: ParticipantId,
  amountCents: number,
  expenseId: string,
  status: LedgerPayment['status'] = 'confirmed',
): LedgerPayment {
  return { kind: 'forgiveness', from, to, amountCents, expenseId, status };
}

/** Small seeded random number generator (mulberry32), so randomized tests are repeatable. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
