import { describe, expect, it } from 'vitest';

import { explainShare, formatPercent, type BillLine } from './breakdown';

const item = (
  name: string,
  amountCents: number,
  participantIds: string[],
  extra: Partial<BillLine> = {},
): BillLine => ({
  name,
  amountCents,
  kind: 'item',
  quantity: 1,
  participantIds,
  units: participantIds.map(() => 1),
  byUnits: false,
  ...extra,
});
const adjustment = (name: string, kind: string, amountCents: number): BillLine => ({
  name,
  amountCents,
  kind,
  quantity: 1,
  participantIds: [],
  units: [],
  byUnits: false,
});

const costco: BillLine[] = [
  item('Protein powder', 4799, ['leo']),
  item('Paper towels', 2299, ['leo', 'jeff', 'maya']),
  item('Dish soap', 1149, ['leo', 'jeff', 'maya']),
  item('Trash bags', 1052, ['leo', 'jeff', 'maya']),
  item('Oat milk', 1249, ['maya']),
];

describe('explainShare', () => {
  it('explains Jeff’s $15.00, item by item', () => {
    const jeff = explainShare(costco, 'jeff');
    expect(jeff?.items).toEqual([
      { title: 'Paper towels', detail: '$22.99 split 3 ways', cents: 766 },
      { title: 'Dish soap', detail: '$11.49 split 3 ways', cents: 383 },
      { title: 'Trash bags', detail: '$10.52 split 3 ways', cents: 351 },
    ]);
    expect(jeff?.totalCents).toBe(1500);
  });

  it('shows tagged lines by count, and each tax or discount as a percent of it', () => {
    const lines = [
      item('Soft drink', 750, ['jeff', 'maya'], { quantity: 3, units: [2, 1], byUnits: true }),
      item('Fries', 250, ['maya']),
      adjustment('Tax', 'tax', 100),
      adjustment('Discount', 'discount', -50),
    ];
    const jeff = explainShare(lines, 'jeff');
    expect(jeff?.items).toEqual([
      { title: '3 × Soft drink', detail: '2 of 3 · $7.50 for all', cents: 500 },
    ]);
    expect(jeff?.percentOfItems).toBe('50%');
    expect(jeff?.adjustments).toEqual([
      { title: 'Tax', detail: '50% of $1.00', cents: 50 },
      { title: 'Discount', detail: '50% of $0.50', cents: -25 },
    ]);
    expect(jeff?.totalCents).toBe(525);
  });

  it('has nothing to explain for a total split by amount, or someone not on it', () => {
    expect(explainShare([adjustment('Tax', 'tax', 100)], 'jeff')).toBeNull();
    expect(explainShare(costco, 'sam')).toBeNull();
  });

  it('shows nothing rather than a breakdown that doesn’t come to the saved share', () => {
    expect(explainShare(costco, 'jeff', 1500)?.totalCents).toBe(1500);
    expect(explainShare(costco, 'jeff', 1501)).toBeNull();
  });

  it('formats percents to one decimal', () => {
    expect(formatPercent(1500 / 14000)).toBe('10.7%');
    expect(formatPercent(0.5)).toBe('50%');
  });
});
