import { addTo, assertCents, assertPayment, compareIds, forgivenExpense } from './internal';
import type { Debt, LedgerExpense, LedgerPayment, ParticipantId } from './types';

type PairTotals = Map<ParticipantId, Map<ParticipantId, number>>;

function addDebt(totals: PairTotals, from: ParticipantId, to: ParticipantId, amount: number) {
  let row = totals.get(from);
  if (!row) totals.set(from, (row = new Map()));
  addTo(row, to, amount);
}

function toSortedDebts(totals: PairTotals): Debt[] {
  const debts: Debt[] = [];
  for (const [from, row] of totals) {
    for (const [to, amountCents] of row) {
      if (amountCents !== 0) debts.push({ from, to, amountCents });
    }
  }
  return debts.sort((a, b) => compareIds(a.from, b.from) || compareIds(a.to, b.to));
}

/**
 * Who owes whom, per direction, before netting the two directions of a pair.
 *
 * - For every expense that isn't voided, each participant other than the payer
 *   owes the payer their share.
 * - Only confirmed payments and forgiveness count (Rule 4). Claimed and rejected ones don't.
 * - Forgiveness for a voided expense is ignored, since that debt no longer exists.
 *
 * A negative amount means `from` paid back more than they owed `to`.
 * Use `netBalances` for the final who-owes-whom.
 */
export function computeBalances(
  expenses: readonly LedgerExpense[],
  payments: readonly LedgerPayment[],
): Debt[] {
  const totals: PairTotals = new Map();
  const expensesById = new Map(expenses.map((e) => [e.id, e]));

  for (const expense of expenses) {
    if (expense.voidedAt) continue;
    for (const share of expense.shares) {
      assertCents(share.amountCents, `Share of ${share.participantId} in ${expense.id}`);
      if (share.participantId !== expense.paidBy) {
        addDebt(totals, share.participantId, expense.paidBy, share.amountCents);
      }
    }
  }

  for (const payment of payments) {
    assertPayment(payment);
    if (payment.status !== 'confirmed') continue;
    if (payment.kind === 'forgiveness' && forgivenExpense(payment, expensesById).voidedAt) {
      continue;
    }
    addDebt(totals, payment.from, payment.to, -payment.amountCents);
  }

  return toSortedDebts(totals);
}

/**
 * Nets each pair into a single positive debt.
 * If Leo owes Maya 3000 and Maya owes Leo 4200, the result is Maya owes Leo 1200.
 * Pairs that come out even are left out.
 */
export function netBalances(debts: readonly Debt[]): Debt[] {
  const totals: PairTotals = new Map();
  for (const debt of debts) {
    assertCents(debt.amountCents, `Debt from ${debt.from} to ${debt.to}`);
    // Store each pair once, keyed by the smaller id: positive means first owes second.
    if (compareIds(debt.from, debt.to) < 0) addDebt(totals, debt.from, debt.to, debt.amountCents);
    else addDebt(totals, debt.to, debt.from, -debt.amountCents);
  }

  return toSortedDebts(totals).map((d) =>
    d.amountCents > 0 ? d : { from: d.to, to: d.from, amountCents: -d.amountCents },
  );
}
