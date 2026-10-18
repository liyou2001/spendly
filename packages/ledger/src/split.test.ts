import { describe, expect, it } from 'vitest';

import { LedgerError } from './errors';
import { splitEvenly } from './split';

describe('splitEvenly', () => {
  it('splits $10.00 three ways as 334, 333, 333 in participant id order', () => {
    expect(splitEvenly(1000, ['maya', 'jeff', 'leo'])).toEqual([
      { participantId: 'jeff', amountCents: 334 },
      { participantId: 'leo', amountCents: 333 },
      { participantId: 'maya', amountCents: 333 },
    ]);
  });

  it('gives the same result for every input order, every run', () => {
    const expected = splitEvenly(1000, ['a', 'b', 'c']);
    const orders = [
      ['a', 'b', 'c'],
      ['a', 'c', 'b'],
      ['b', 'a', 'c'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
      ['c', 'b', 'a'],
    ];
    for (let run = 0; run < 3; run++) {
      for (const order of orders) expect(splitEvenly(1000, order)).toEqual(expected);
    }
  });

  it('orders ids by code unit, not locale', () => {
    // Locale-aware sorting would put "a" before "B"; code-unit order puts "B" first.
    expect(splitEvenly(1, ['a', 'B']).map((s) => s.amountCents)).toEqual([1, 0]);
    expect(splitEvenly(1, ['a', 'B'])[0]?.participantId).toBe('B');
  });

  it('splits exact amounts with no leftover', () => {
    expect(splitEvenly(4500, ['leo', 'jeff', 'maya']).map((s) => s.amountCents)).toEqual([
      1500, 1500, 1500,
    ]);
  });

  it('handles one participant, zero, and fewer cents than people', () => {
    expect(splitEvenly(1234, ['leo'])).toEqual([{ participantId: 'leo', amountCents: 1234 }]);
    expect(splitEvenly(0, ['a', 'b']).map((s) => s.amountCents)).toEqual([0, 0]);
    expect(splitEvenly(2, ['a', 'b', 'c']).map((s) => s.amountCents)).toEqual([1, 1, 0]);
  });

  it('always sums to the total', () => {
    for (let total = 0; total <= 500; total++) {
      for (let people = 1; people <= 7; people++) {
        const ids = Array.from({ length: people }, (_, i) => `p${i}`);
        const shares = splitEvenly(total, ids);
        expect(shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(total);
        const amounts = shares.map((s) => s.amountCents);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects bad input', () => {
    expect(() => splitEvenly(1000, [])).toThrow(LedgerError);
    expect(() => splitEvenly(1000, ['a', 'a'])).toThrow(LedgerError);
    expect(() => splitEvenly(-1, ['a'])).toThrow(LedgerError);
    expect(() => splitEvenly(10.5, ['a'])).toThrow(LedgerError);
  });
});
