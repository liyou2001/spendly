import { describe, expect, it } from 'vitest';

import {
  COSTCO_ITEM_COUNT,
  COSTCO_ITEM_GROUPS,
  COSTCO_TOTAL_CENTS,
  costcoBreakdown,
  costcoShare,
} from './costcoExample';

describe('the Costco example', () => {
  it('matches the plan and the seed: $140.00, Leo $83.00, Jeff $15.00, Maya $42.00', () => {
    expect(COSTCO_TOTAL_CENTS).toBe(14000);
    expect(costcoShare('Leo')).toBe(8300);
    expect(costcoShare('Jeff')).toBe(1500);
    expect(costcoShare('Maya')).toBe(4200);
    expect(costcoShare('Leo') + costcoShare('Jeff') + costcoShare('Maya')).toBe(COSTCO_TOTAL_CENTS);
    expect(COSTCO_ITEM_COUNT).toBe(9);
  });

  it('explains Jeff’s share like the expense screen, adding up to it', () => {
    const jeff = costcoBreakdown('Jeff');
    expect(jeff?.items).toEqual([
      { title: 'Paper towels', detail: '$22.99 split 3 ways', cents: 766 },
      { title: 'Dish soap', detail: '$11.49 split 3 ways', cents: 383 },
      { title: 'Trash bags', detail: '$10.52 split 3 ways', cents: 351 },
    ]);
    expect(jeff?.totalCents).toBe(costcoShare('Jeff'));
  });

  it('groups the items for the same people for the landing page', () => {
    expect(COSTCO_ITEM_GROUPS).toEqual([
      { names: 'Protein powder, graphic tee, granola bars', cents: 6800, people: ['Leo'] },
      {
        names: 'Paper towels, dish soap, trash bags',
        cents: 4500,
        people: ['Leo', 'Jeff', 'Maya'],
      },
      { names: 'Oat milk, hummus, veggie chips', cents: 2700, people: ['Maya'] },
    ]);
  });
});
