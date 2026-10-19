// Helpers shared inside the package. Not exported from index.ts.
import { LedgerError } from './errors';
import type { Forgiveness, LedgerExpense, LedgerPayment } from './types';

export function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new LedgerError(`${label} must be a whole number of cents, got ${value}`);
  }
}

/** Plain code-unit comparison, so ordering never depends on the device's locale. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function assertUniqueIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new LedgerError(`${label} has duplicate participant ids`);
  }
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-10-17` -> `2026-10-01`. Works on the string so time zones can't shift the month. */
export function monthOf(date: string): string {
  const match = DATE.exec(date);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    throw new LedgerError(`Expected a YYYY-MM-DD date, got "${date}"`);
  }
  return `${match[1]}-${match[2]}-01`;
}

export function addTo<K>(totals: Map<K, number>, key: K, amount: number): void {
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

export function assertPayment(payment: LedgerPayment): void {
  assertCents(payment.amountCents, 'Payment amount');
  if (payment.amountCents <= 0) throw new LedgerError('Payment amount must be positive');
  if (payment.from === payment.to) throw new LedgerError('A payment needs two different people');
}

/** The expense a forgiveness belongs to. `to` (the forgiver) must be its payer. */
export function forgivenExpense(
  payment: Forgiveness,
  expensesById: ReadonlyMap<string, LedgerExpense>,
): LedgerExpense {
  const expense = expensesById.get(payment.expenseId);
  if (!expense) throw new LedgerError(`Forgiveness for unknown expense ${payment.expenseId}`);
  if (expense.paidBy !== payment.to) {
    throw new LedgerError(`Only the payer of ${expense.id} can forgive debts on it`);
  }
  return expense;
}
