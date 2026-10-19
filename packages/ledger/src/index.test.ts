import { describe, expect, it } from 'vitest';

import * as ledger from './index';

describe('package exports', () => {
  // Step 2 requires every exported function to be tested. When adding an export,
  // add its tests, then add it here.
  it('exports exactly the tested functions', () => {
    expect(Object.keys(ledger).sort()).toEqual([
      'LedgerError',
      'computeBalances',
      'computeShares',
      'formatAmount',
      'formatCents',
      'isCents',
      'netBalances',
      'parseCents',
      'paymentAppLinks',
      'shareBreakdown',
      'spendingByCategory',
      'splitEvenly',
    ]);
  });

  it('marks ledger errors so callers can tell them apart', () => {
    const error = new ledger.LedgerError('bad');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LedgerError');
    expect(() => ledger.splitEvenly(100, [])).toThrow(ledger.LedgerError);
  });
});
