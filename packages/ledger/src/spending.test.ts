import { describe, expect, it } from 'vitest';

import { LedgerError } from './errors';
import { spendingByCategory } from './spending';
import { expense, forgiveness, JEFF, LEO, MAYA, payment, simpleExpense } from './testing/fixtures';
import type { LedgerExpense, LedgerPayment } from './types';

const spending = (
  participantIds: string[],
  expenses: LedgerExpense[],
  payments: LedgerPayment[] = [],
) => spendingByCategory({ participantIds, expenses, payments });

describe('spendingByCategory', () => {
  it("counts only Leo's $83.00 share of the $140.00 Costco trip, under Groceries", () => {
    expect(spending([LEO], [expense()])).toEqual([
      { month: '2026-10-01', categoryId: 'groceries', amountCents: 8300 },
    ]);
  });

  it("leaves other people's shares uncategorized, since the category is the payer's", () => {
    expect(spending([JEFF], [expense()])).toEqual([
      { month: '2026-10-01', categoryId: null, amountCents: 1500 },
    ]);
  });

  it("uses a participant's own category override", () => {
    const costco = expense();
    const withOverride = {
      ...costco,
      shares: costco.shares.map((s) =>
        s.participantId === JEFF ? { ...s, categoryOverrideId: 'jeff-household' } : s,
      ),
    };
    expect(spending([JEFF], [withOverride])).toEqual([
      { month: '2026-10-01', categoryId: 'jeff-household', amountCents: 1500 },
    ]);
  });

  it("doesn't change anyone's spending when a repayment is made", () => {
    const repayments = [payment(JEFF, LEO, 1500), payment(MAYA, LEO, 2000, 'claimed')];
    for (const person of [LEO, JEFF, MAYA]) {
      expect(spending([person], [expense()], repayments)).toEqual(spending([person], [expense()]));
    }
  });

  it("adds forgiven debt to the forgiver's spending in the expense's category and month", () => {
    const forgiven = [forgiveness(JEFF, LEO, 1500, 'costco')];
    expect(spending([LEO], [expense()], forgiven)).toEqual([
      { month: '2026-10-01', categoryId: 'groceries', amountCents: 9800 },
    ]);
    // The person whose debt was forgiven spends no more and no less.
    expect(spending([JEFF], [expense()], forgiven)).toEqual(spending([JEFF], [expense()]));
  });

  it('ignores forgiveness that is not confirmed or whose expense was voided', () => {
    expect(
      spending([LEO], [expense()], [forgiveness(JEFF, LEO, 1500, 'costco', 'claimed')]),
    ).toEqual(spending([LEO], [expense()]));
    const voided = expense({ voidedAt: '2026-10-18T12:00:00Z' });
    expect(spending([LEO], [voided], [forgiveness(JEFF, LEO, 1500, 'costco')])).toEqual([]);
  });

  it('leaves voided expenses out', () => {
    expect(spending([LEO], [expense({ voidedAt: '2026-10-18T12:00:00Z' })])).toEqual([]);
  });

  it('groups by month and category, sorted', () => {
    const expenses = [
      expense(),
      expense({ id: 'costco-nov', expenseDate: '2026-11-02' }),
      simpleExpense('pizza', LEO, { [LEO]: 1200, [JEFF]: 1200 }, { expenseDate: '2026-10-30' }),
    ];
    expect(spending([LEO], expenses)).toEqual([
      { month: '2026-10-01', categoryId: 'dining', amountCents: 1200 },
      { month: '2026-10-01', categoryId: 'groceries', amountCents: 8300 },
      { month: '2026-11-01', categoryId: 'groceries', amountCents: 8300 },
    ]);
  });

  it('combines a user’s participant ids across groups', () => {
    // Leo is "leo" in the apartment group and "leo-personal" in his Personal group.
    const personal = simpleExpense(
      'books',
      'leo-personal',
      { 'leo-personal': 3500 },
      {
        categoryId: 'groceries',
        expenseDate: '2026-10-05',
      },
    );
    expect(spending([LEO, 'leo-personal'], [expense(), personal])).toEqual([
      { month: '2026-10-01', categoryId: 'groceries', amountCents: 11800 },
    ]);
  });

  it('works on the date string, so time zones cannot move an expense to another month', () => {
    const lastDay = expense({ expenseDate: '2026-10-31' });
    expect(spending([LEO], [lastDay])[0]?.month).toBe('2026-10-01');
  });

  it('rejects bad dates and invalid payments', () => {
    expect(() => spending([LEO], [expense({ expenseDate: '10/17/2026' })])).toThrow(LedgerError);
    expect(() => spending([LEO], [expense({ expenseDate: '2026-13-01' })])).toThrow(LedgerError);
    expect(() => spending([LEO], [expense()], [payment(JEFF, LEO, 0)])).toThrow(LedgerError);
    expect(() => spending([LEO], [expense()], [forgiveness(JEFF, LEO, 100, 'unknown')])).toThrow(
      LedgerError,
    );
  });
});
