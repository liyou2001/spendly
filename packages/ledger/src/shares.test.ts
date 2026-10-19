import { describe, expect, it } from 'vitest';

import { LedgerError } from './errors';
import { computeShares, shareBreakdown } from './shares';
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

  it('splits a line by units: 3 × Soft drink $7.50, Jeff 2 and Maya 1', () => {
    const drinks: ExpenseLine = {
      kind: 'item',
      amountCents: 750,
      participantIds: [JEFF, MAYA],
      units: [2, 1],
    };
    expect(amounts([drinks])).toEqual({ [JEFF]: 500, [MAYA]: 250 });
  });

  it('treats equal units as an even split, and groups lines with the same units', () => {
    const even: ExpenseLine = { kind: 'item', amountCents: 1000, participantIds: [JEFF, MAYA] };
    expect(amounts([{ ...even, units: [3, 3] }])).toEqual(amounts([even]));
    // 2:1 and 4:2 are the same split, so the two lines round once together.
    const lines: ExpenseLine[] = [
      { kind: 'item', amountCents: 101, participantIds: [JEFF, MAYA], units: [2, 1] },
      { kind: 'item', amountCents: 100, participantIds: [MAYA, JEFF], units: [2, 4] },
    ];
    expect(amounts(lines)).toEqual({ [JEFF]: 134, [MAYA]: 67 });
  });

  it('gives a spare cent from a units split to the largest remainder, then by id', () => {
    // $1.00 over 1:1:1 units would be even; over 2:1 it's 66.67 and 33.33.
    expect(
      amounts([{ kind: 'item', amountCents: 100, participantIds: [MAYA, JEFF], units: [1, 2] }]),
    ).toEqual({ [JEFF]: 67, [MAYA]: 33 });
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
      [{ ...item(100, ['a', 'b']), units: [1] } as ExpenseLine],
      [{ ...item(100, ['a', 'b']), units: [1, 0] } as ExpenseLine],
      [{ ...item(100, ['a']), units: [1.5] } as ExpenseLine],
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
        const participantIds = shuffle(people).slice(0, int(1, people.length));
        lines.push({
          kind: 'item',
          amountCents,
          participantIds,
          ...(random() < 0.3 ? { units: participantIds.map(() => int(1, 5)) } : {}),
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

      // Shuffle each item's people together with their units.
      const reordered = shuffle(lines).map((line) => {
        if (line.kind !== 'item') return line;
        const pairs = shuffle(
          line.participantIds.map((id, i) => [id, line.units?.[i] ?? 1] as const),
        );
        return {
          ...line,
          participantIds: pairs.map(([id]) => id),
          ...(line.units ? { units: pairs.map(([, units]) => units) } : {}),
        };
      });
      expect(computeShares({ lines: reordered })).toEqual(result);
    }
  });
});

describe('shareBreakdown', () => {
  it('shows Jeff’s $15.00 on the Costco receipt, item by item', () => {
    const jeff = shareBreakdown({ lines: costcoLines }, JEFF);
    expect(jeff.items).toEqual([
      { lineIndex: 3, cents: 766 },
      { lineIndex: 4, cents: 383 },
      { lineIndex: 5, cents: 351 },
    ]);
    expect(jeff).toMatchObject({ itemsCents: 1500, totalCents: 1500, adjustments: [] });
    expect(jeff.percentOfItems).toBeCloseTo(1500 / 14000);
  });

  it('splits a tagged line by units', () => {
    const drinks: ExpenseLine = {
      kind: 'item',
      amountCents: 750,
      participantIds: [JEFF, MAYA],
      units: [2, 1],
    };
    expect(shareBreakdown({ lines: [drinks] }, JEFF).items).toEqual([{ lineIndex: 0, cents: 500 }]);
  });

  it('gives each tax, tip and discount line its part, adding up to the share', () => {
    const lines: ExpenseLine[] = [
      ...costcoLines,
      { kind: 'tax', amountCents: 1157 },
      { kind: 'tip', amountCents: 200 },
      { kind: 'discount', amountCents: -500 },
    ];
    const shares = computeShares({ lines }).shares;
    for (const { participantId, amountCents } of shares) {
      const breakdown = shareBreakdown({ lines }, participantId);
      expect(breakdown.totalCents).toBe(amountCents);
      expect(breakdown.adjustments.map((a) => a.kind)).toEqual(['tax', 'tip', 'discount']);
      const sum =
        breakdown.items.reduce((total, i) => total + i.cents, 0) +
        breakdown.adjustments.reduce((total, a) => total + a.cents, 0);
      expect(sum).toBe(amountCents);
    }
    const jeff = shareBreakdown({ lines }, JEFF);
    expect(jeff.adjustments.find((a) => a.kind === 'discount')?.cents).toBeLessThan(0);
  });

  it('is empty for someone not on the expense', () => {
    expect(shareBreakdown({ lines: costcoLines }, 'p-sam')).toMatchObject({
      items: [],
      itemsCents: 0,
      totalCents: 0,
      percentOfItems: 0,
    });
  });

  it('randomized: every person’s breakdown adds up to exactly their share', () => {
    const random = seededRandom(20261020);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    for (let run = 0; run < 1000; run++) {
      const people = Array.from({ length: int(1, 6) }, (_, i) => `p${i}`);
      const lines: ExpenseLine[] = [];
      let itemsTotal = 0;
      for (let i = int(1, 10); i > 0; i--) {
        const amountCents = int(1, 20_000);
        itemsTotal += amountCents;
        const participantIds = people.filter(() => random() < 0.6);
        if (participantIds.length === 0) participantIds.push(people[0] ?? 'p0');
        lines.push({
          kind: 'item',
          amountCents,
          participantIds,
          ...(random() < 0.3 ? { units: participantIds.map(() => int(1, 4)) } : {}),
        });
      }
      if (random() < 0.6) lines.push({ kind: 'tax', amountCents: int(1, 3_000) });
      if (random() < 0.4) lines.push({ kind: 'tip', amountCents: int(1, 3_000) });
      if (random() < 0.4)
        lines.push({ kind: 'discount', amountCents: -int(1, itemsTotal - 1 || 1) });
      if (lines.reduce((sum, l) => sum + l.amountCents, 0) <= 0) continue;

      for (const { participantId, amountCents } of computeShares({ lines }).shares) {
        const breakdown = shareBreakdown({ lines }, participantId);
        const sum =
          breakdown.items.reduce((total, i) => total + i.cents, 0) +
          breakdown.adjustments.reduce((total, a) => total + a.cents, 0);
        expect(breakdown.totalCents).toBe(amountCents);
        expect(sum).toBe(amountCents);
      }
    }
  });
});
