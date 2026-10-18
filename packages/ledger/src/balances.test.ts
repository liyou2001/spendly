import { describe, expect, it } from 'vitest';

import { computeBalances, netBalances } from './balances';
import { LedgerError } from './errors';
import { expense, forgiveness, JEFF, LEO, MAYA, payment, simpleExpense } from './testing/fixtures';

describe('computeBalances', () => {
  it('has Jeff owing Leo 1500 and Maya owing Leo 4200 after Costco', () => {
    expect(computeBalances([expense()], [])).toEqual([
      { from: JEFF, to: LEO, amountCents: 1500 },
      { from: MAYA, to: LEO, amountCents: 4200 },
    ]);
  });

  it('never has the payer owing themselves', () => {
    const debts = computeBalances([expense()], []);
    expect(debts.some((d) => d.from === LEO)).toBe(false);
  });

  it('reduces a debt by a confirmed payment: 4250 owed, 2000 paid, 2250 left', () => {
    const owed = simpleExpense('dinner', LEO, { [LEO]: 4250, [JEFF]: 4250 });
    expect(computeBalances([owed], [payment(JEFF, LEO, 2000)])).toEqual([
      { from: JEFF, to: LEO, amountCents: 2250 },
    ]);
  });

  it('ignores claimed and rejected payments until they are confirmed', () => {
    const owed = simpleExpense('dinner', LEO, { [JEFF]: 4250 });
    const before = computeBalances([owed], []);
    expect(computeBalances([owed], [payment(JEFF, LEO, 2000, 'claimed')])).toEqual(before);
    expect(computeBalances([owed], [payment(JEFF, LEO, 2000, 'rejected')])).toEqual(before);
  });

  it('drops a debt that is paid in full', () => {
    expect(computeBalances([expense()], [payment(JEFF, LEO, 1500)])).toEqual([
      { from: MAYA, to: LEO, amountCents: 4200 },
    ]);
  });

  it('shows an overpayment as a negative debt', () => {
    expect(computeBalances([expense()], [payment(JEFF, LEO, 2000)])).toContainEqual({
      from: JEFF,
      to: LEO,
      amountCents: -500,
    });
  });

  it('leaves voided expenses out', () => {
    expect(computeBalances([expense({ voidedAt: '2026-10-18T12:00:00Z' })], [])).toEqual([]);
  });

  it('adds up several expenses between the same people', () => {
    const lunch = simpleExpense('lunch', LEO, { [JEFF]: 800 });
    expect(computeBalances([expense(), lunch], [])).toContainEqual({
      from: JEFF,
      to: LEO,
      amountCents: 2300,
    });
  });

  it('reduces the balance by forgiveness', () => {
    expect(computeBalances([expense()], [forgiveness(MAYA, LEO, 4200, 'costco')])).toEqual([
      { from: JEFF, to: LEO, amountCents: 1500 },
    ]);
  });

  it('ignores forgiveness that is not confirmed or whose expense was voided', () => {
    const voided = expense({ voidedAt: '2026-10-18T12:00:00Z' });
    expect(
      computeBalances([expense()], [forgiveness(MAYA, LEO, 4200, 'costco', 'claimed')]),
    ).toEqual(computeBalances([expense()], []));
    expect(computeBalances([voided], [forgiveness(MAYA, LEO, 4200, 'costco')])).toEqual([]);
  });

  it('rejects invalid payments and forgiveness', () => {
    const costco = [expense()];
    expect(() => computeBalances(costco, [payment(JEFF, LEO, 0)])).toThrow(LedgerError);
    expect(() => computeBalances(costco, [payment(JEFF, LEO, -100)])).toThrow(LedgerError);
    expect(() => computeBalances(costco, [payment(JEFF, LEO, 10.5)])).toThrow(LedgerError);
    expect(() => computeBalances(costco, [payment(JEFF, JEFF, 100)])).toThrow(LedgerError);
    // Only Leo paid for Costco, so only Leo can forgive debts on it.
    expect(() => computeBalances(costco, [forgiveness(MAYA, JEFF, 100, 'costco')])).toThrow(
      LedgerError,
    );
    expect(() => computeBalances(costco, [forgiveness(MAYA, LEO, 100, 'unknown')])).toThrow(
      LedgerError,
    );
  });

  it('rejects shares that are not whole cents', () => {
    const bad = simpleExpense('bad', LEO, { [JEFF]: 10.5 });
    expect(() => computeBalances([bad], [])).toThrow(LedgerError);
  });
});

describe('netBalances', () => {
  it('nets each pair: Leo owes Maya 3000, Maya owes Leo 4200, so Maya owes Leo 1200', () => {
    const groceries = expense(); // Maya owes Leo 4200, Jeff owes Leo 1500
    const utilities = simpleExpense('utilities', MAYA, { [LEO]: 3000 });
    expect(netBalances(computeBalances([groceries, utilities], []))).toEqual([
      { from: JEFF, to: LEO, amountCents: 1500 },
      { from: MAYA, to: LEO, amountCents: 1200 },
    ]);
  });

  it('flips direction when the other side owes more', () => {
    expect(
      netBalances([
        { from: LEO, to: MAYA, amountCents: 5000 },
        { from: MAYA, to: LEO, amountCents: 4200 },
      ]),
    ).toEqual([{ from: LEO, to: MAYA, amountCents: 800 }]);
  });

  it('turns an overpayment into a debt the other way', () => {
    expect(netBalances([{ from: JEFF, to: LEO, amountCents: -500 }])).toEqual([
      { from: LEO, to: JEFF, amountCents: 500 },
    ]);
  });

  it('leaves out pairs that come out even', () => {
    expect(
      netBalances([
        { from: LEO, to: MAYA, amountCents: 4200 },
        { from: MAYA, to: LEO, amountCents: 4200 },
      ]),
    ).toEqual([]);
  });

  it('does not depend on input order', () => {
    const debts = [
      { from: 'b', to: 'a', amountCents: 100 },
      { from: 'a', to: 'b', amountCents: 30 },
      { from: 'c', to: 'a', amountCents: 5 },
    ];
    expect(netBalances([...debts].reverse())).toEqual(netBalances(debts));
    expect(netBalances(debts)).toEqual([
      { from: 'b', to: 'a', amountCents: 70 },
      { from: 'c', to: 'a', amountCents: 5 },
    ]);
  });

  it('rejects amounts that are not whole cents', () => {
    expect(() => netBalances([{ from: 'a', to: 'b', amountCents: 1.5 }])).toThrow(LedgerError);
  });
});
