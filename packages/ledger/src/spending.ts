import {
  addTo,
  assertCents,
  assertPayment,
  compareIds,
  forgivenExpense,
  monthOf,
} from './internal';
import type { CategorySpending, LedgerExpense, LedgerPayment, ParticipantId } from './types';

/**
 * One user's spending by month and category:
 * - their own share of every expense that isn't voided;
 * - plus debts they forgave, in the forgiven expense's category and month.
 *
 * Repayments never count, in either direction (Rule 7).
 * `participantIds` are all of the user's participant ids, one per group they're in.
 *
 * A share's category is the user's override if they set one. Otherwise the payer's own
 * share uses the expense category, and anyone else's share is uncategorized (`null`),
 * because the expense category belongs to the payer.
 */
export function spendingByCategory(input: {
  participantIds: readonly ParticipantId[];
  expenses: readonly LedgerExpense[];
  payments: readonly LedgerPayment[];
}): CategorySpending[] {
  const mine = new Set(input.participantIds);
  // Keyed by month and category; JSON keeps a null category distinct from any string id.
  const totals = new Map<string, number>();
  const add = (month: string, categoryId: string | null, amount: number) =>
    addTo(totals, JSON.stringify([month, categoryId]), amount);

  for (const expense of input.expenses) {
    if (expense.voidedAt) continue;
    const month = monthOf(expense.expenseDate);
    for (const share of expense.shares) {
      if (!mine.has(share.participantId)) continue;
      assertCents(share.amountCents, `Share of ${share.participantId} in ${expense.id}`);
      const ownCategory = share.participantId === expense.paidBy ? expense.categoryId : null;
      add(month, share.categoryOverrideId ?? ownCategory, share.amountCents);
    }
  }

  const expensesById = new Map(input.expenses.map((e) => [e.id, e]));
  for (const payment of input.payments) {
    assertPayment(payment);
    if (payment.kind !== 'forgiveness' || payment.status !== 'confirmed') continue;
    if (!mine.has(payment.to)) continue;
    const expense = forgivenExpense(payment, expensesById);
    if (expense.voidedAt) continue;
    add(monthOf(expense.expenseDate), expense.categoryId, payment.amountCents);
  }

  return [...totals]
    .filter(([, amountCents]) => amountCents !== 0)
    .map(([key, amountCents]) => {
      const [month, categoryId] = JSON.parse(key) as [string, string | null];
      return { month, categoryId, amountCents };
    })
    .sort(
      (a, b) => compareIds(a.month, b.month) || compareIds(a.categoryId ?? '', b.categoryId ?? ''),
    );
}
