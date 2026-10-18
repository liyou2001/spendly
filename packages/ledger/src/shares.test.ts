import { describe, expect, it } from 'vitest';

import { LedgerError } from './errors';
import { computeShares } from './shares';
import { costcoLines, JEFF, LEO, MAYA, seededRandom } from './testing/fixtures';
import type { ExpenseLine } from './types';

const amounts = (lines: ExpenseLine[]) =>
  Object.fromEntries(computeShares({ lines }).shares.map((s) => [s.participantId, s.amountCents]));

describe('computeShares', () => {
  it('splits the Costco receipt: Leo 8300, Jeff 1500, Maya 4200, total 14000', () => {
    expect(computeShares({ lines: costcoLines })).toEqual({
      totalCents: 14000,
      shares: [
        { participantId: JEFF, amountCents: 1500 },
        { participantId: LEO, amountCents: 8300 },
        { participantId: MAYA, amountCents: 4200 },
      ],
    });
  });

  it('adds up items for the same people before splitting, so rounding happens once', () => {
    // Split one at a time, $22.99 and $10.52 would each leave a stray cent.
    const shared = costcoLines.slice(3, 6);
    expect(amounts(shared)).toEqual({ [JEFF]: 1500, [LEO]: 1500, [MAYA]: 1500 });
  });

  it('treats the same people in a different order as the same group', () => {
    expect(
      amounts([
        { kind: 'item', amountCents: 50, participantIds: ['a', 'b'] },
        { kind: 'item', amountCents: 51, participantIds: ['b', 'a'] },
      ]),
    ).toEqual({ a: 51, b: 50 });
  });

  it('splits tax in proportion to item subtotals and still sums to the total', () => {
    const result = computeShares({
      lines: [
        { kind: 'item', amountCents: 1000, participantIds: ['a'] },
        { kind: 'item', amountCents: 2000, participantIds: ['b'] },
        { kind: 'item', amountCents: 3000, participantIds: ['c'] },
        { kind: 'tax', amountCents: 100 },
      ],
    });
    // Exact tax shares are 16.67, 33.33 and 50; the spare cent goes to the largest remainder.
    expect(result).toEqual({
      totalCents: 6100,
      shares: [
        { participantId: 'a', amountCents: 1017 },
        { participantId: 'b', amountCents: 2033 },
        { participantId: 'c', amountCents: 3050 },
      ],
    });
  });

  it('splits tax on the Costco receipt and still sums to the total', () => {
    const result = computeShares({ lines: [...costcoLines, { kind: 'tax', amountCents: 1157 }] });
    expect(result.totalCents).toBe(15157);
    expect(result.shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(15157);
    // 8300/14000 of $11.57 is $6.86 for Leo.
    expect(result.shares.find((s) => s.participantId === LEO)?.amountCents).toBe(8300 + 686);
  });

  it('combines tax, tip and discounts, splitting the net in proportion', () => {
    expect(
      amounts([
        { kind: 'item', amountCents: 1000, participantIds: ['a'] },
        { kind: 'item', amountCents: 3000, participantIds: ['b'] },
        { kind: 'tax', amountCents: 300 },
        { kind: 'tip', amountCents: 600 },
        { kind: 'discount', amountCents: -400 },
      ]),
    ).toEqual({ a: 1125, b: 3375 });
  });

  it('takes discounts off in proportion, never pushing a share below zero', () => {
    expect(
      amounts([
        { kind: 'item', amountCents: 1000, participantIds: ['a'] },
        { kind: 'item', amountCents: 3000, participantIds: ['b'] },
        { kind: 'discount', amountCents: -101 },
      ]),
    ).toEqual({ a: 975, b: 2924 });

    expect(
      amounts([
        { kind: 'item', amountCents: 1, participantIds: ['a'] },
        { kind: 'item', amountCents: 999, participantIds: ['b'] },
        { kind: 'discount', amountCents: -999 },
      ]),
    ).toEqual({ a: 0, b: 1 });
  });

  it('breaks a tie for a spare tax cent by participant id', () => {
    // Equal subtotals, so each person's exact tax share is 0.5 cents.
    const lines = (first: string, second: string): ExpenseLine[] => [
      { kind: 'item', amountCents: 1000, participantIds: [first] },
      { kind: 'item', amountCents: 1000, participantIds: [second] },
      { kind: 'tax', amountCents: 1 },
    ];
    expect(amounts(lines('maya', 'jeff'))).toEqual({ jeff: 1001, maya: 1000 });
    expect(amounts(lines('jeff', 'maya'))).toEqual({ jeff: 1001, maya: 1000 });
  });

  it('gives a spare tip cent to the largest remainder after the item split', () => {
    // Items: a 500, b 499. The 1-cent tip is 0.5005 vs 0.4995 of a cent, so a gets it.
    const result = amounts([
      { kind: 'item', amountCents: 999, participantIds: ['a', 'b'] },
      { kind: 'tip', amountCents: 1 },
    ]);
    expect(result).toEqual({ a: 501, b: 499 });
  });

  it('rejects invalid expenses', () => {
    const item = (amountCents: number, participantIds = ['a']): ExpenseLine => ({
      kind: 'item',
      amountCents,
      participantIds,
    });
    const bad: ExpenseLine[][] = [
      [],
      [{ kind: 'tax', amountCents: 100 }],
      [item(0)],
      [item(-100)],
      [item(10.5)],
      [item(100, [])],
      [item(100, ['a', 'a'])],
      [item(100), { kind: 'tax', amountCents: 0 }],
      [item(100), { kind: 'tip', amountCents: -5 }],
      [item(100), { kind: 'discount', amountCents: 5 }],
      [item(100), { kind: 'discount', amountCents: -100 }],
      [item(100), { kind: 'discount', amountCents: -150 }],
    ];
    for (const lines of bad) expect(() => computeShares({ lines })).toThrow(LedgerError);
  });

  it('randomized: shares always sum to the total and never depend on input order', () => {
    const random = seededRandom(20261017);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const shuffle = <T>(list: readonly T[]) => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    };

    for (let run = 0; run < 2000; run++) {
      const people = Array.from({ length: int(1, 8) }, (_, i) => `person-${i}-${int(0, 999)}`);
      const lines: ExpenseLine[] = [];
      let itemsTotal = 0;
      for (let i = int(1, 15); i > 0; i--) {
        const amountCents = int(1, 50_000);
        itemsTotal += amountCents;
        lines.push({
          kind: 'item',
          amountCents,
          participantIds: shuffle(people).slice(0, int(1, people.length)),
        });
      }
      if (random() < 0.6) lines.push({ kind: 'tax', amountCents: int(1, 5_000) });
      if (random() < 0.4) lines.push({ kind: 'tip', amountCents: int(1, 5_000) });
      if (random() < 0.4)
        lines.push({ kind: 'discount', amountCents: -int(1, itemsTotal - 1 || 1) });
      if (lines.reduce((sum, l) => sum + l.amountCents, 0) <= 0) continue;

      const result = computeShares({ lines });
      const lineTotal = lines.reduce((sum, l) => sum + l.amountCents, 0);

      expect(result.totalCents).toBe(lineTotal);
      expect(result.shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(lineTotal);
      for (const share of result.shares) {
        expect(Number.isSafeInteger(share.amountCents)).toBe(true);
        expect(share.amountCents).toBeGreaterThanOrEqual(0);
      }

      const reordered = shuffle(lines).map((line) =>
        line.kind === 'item' ? { ...line, participantIds: shuffle(line.participantIds) } : line,
      );
      expect(computeShares({ lines: reordered })).toEqual(result);
    }
  });
});
