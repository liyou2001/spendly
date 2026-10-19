import { describe, expect, it } from 'vitest';

import {
  addMonths,
  buildBudgetView,
  daysLeftInMonth,
  effectiveBudget,
  monthLabel,
  monthStart,
  shortMoney,
  splitNote,
  type SpendingItem,
} from './budget';

const costco: SpendingItem = {
  itemId: 'e-costco',
  expenseId: 'e-costco',
  merchant: 'Costco',
  expenseDate: '2026-10-17',
  categoryId: 'c-groceries',
  amountCents: 8300,
  totalCents: 14000,
  paidByName: 'Leo',
  youPaid: true,
  isForgiveness: false,
};
const categories = [
  { id: 'c-rent', name: 'Rent' },
  { id: 'c-groceries', name: 'Groceries' },
  { id: 'c-dining', name: 'Dining' },
];

describe('months', () => {
  it('finds the start, steps across years, and names them', () => {
    expect(monthStart('2026-10-19')).toBe('2026-10-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-10-01', -13)).toBe('2025-09-01');
    expect(monthLabel('2026-10-01')).toBe('October 2026');
  });

  it('counts days left including today, only in the current month', () => {
    expect(daysLeftInMonth('2026-10-19', '2026-10-01')).toBe(13);
    expect(daysLeftInMonth('2026-10-31', '2026-10-01')).toBe(1);
    expect(daysLeftInMonth('2028-02-01', '2028-02-01')).toBe(29);
    expect(daysLeftInMonth('2026-10-19', '2026-09-01')).toBeNull();
  });
});

describe('effectiveBudget', () => {
  const rows = [
    { categoryId: 'c-groceries', month: '2026-10-01', amountCents: 30000 },
    { categoryId: 'c-groceries', month: '2026-12-01', amountCents: null },
    { categoryId: 'c-groceries', month: '2027-02-01', amountCents: 25000 },
  ];

  it('carries a budget forward until the next change', () => {
    expect(effectiveBudget(rows, 'c-groceries', '2026-09-01')).toBeNull();
    expect(effectiveBudget(rows, 'c-groceries', '2026-10-01')).toBe(30000);
    expect(effectiveBudget(rows, 'c-groceries', '2026-11-01')).toBe(30000);
    expect(effectiveBudget(rows, 'c-groceries', '2026-12-01')).toBeNull();
    expect(effectiveBudget(rows, 'c-groceries', '2027-03-01')).toBe(25000);
    expect(effectiveBudget(rows, 'c-dining', '2026-10-01')).toBeNull();
  });
});

describe('splitNote', () => {
  it('explains your share of a split you paid for, as in the plan', () => {
    expect(splitNote([costco])).toBe('Includes your $83 share of the $140 Costco trip');
  });

  it('names the payer and the total when someone else paid', () => {
    expect(
      splitNote([
        { ...costco, amountCents: 1500, totalCents: 14000, paidByName: 'Leo', youPaid: false },
      ]),
    ).toBe('Includes your $15 share of Leo’s $140 Costco trip');
  });

  it('says nothing for purchases that were all yours', () => {
    expect(splitNote([{ ...costco, amountCents: 1400, totalCents: 1400 }])).toBeNull();
  });

  it('counts several splits, and adds forgiven debts', () => {
    const pizza = {
      ...costco,
      expenseId: 'e-pizza',
      merchant: 'Pizza',
      amountCents: 1000,
      totalCents: 3000,
    };
    const forgiven = { ...costco, amountCents: 1050, isForgiveness: true };
    expect(splitNote([costco, pizza])).toBe('Includes your shares of 2 split purchases');
    expect(splitNote([costco, forgiven])).toBe(
      'Includes your $83 share of the $140 Costco trip, plus $10.50 you forgave',
    );
    expect(splitNote([forgiven])).toBe('Includes $10.50 you forgave');
  });
});

describe('buildBudgetView', () => {
  it('shows Groceries at $83 of a $300 budget, not $140', () => {
    const view = buildBudgetView({
      month: '2026-10-01',
      today: '2026-10-19',
      categories,
      budgets: [{ categoryId: 'c-groceries', month: '2026-09-01', amountCents: 30000 }],
      items: [costco],
    });
    expect(view).toMatchObject({
      spentCents: 8300,
      budgetCents: 30000,
      leftCents: 21700,
      daysLeft: 13,
    });
    expect(view.lines).toEqual([
      {
        categoryId: 'c-groceries',
        name: 'Groceries',
        spentCents: 8300,
        budgetCents: 30000,
        note: 'Includes your $83 share of the $140 Costco trip',
      },
    ]);
  });

  it('lists budgeted categories with nothing spent, and Uncategorized last', () => {
    const view = buildBudgetView({
      month: '2026-10-01',
      today: '2026-11-02',
      categories,
      budgets: [{ categoryId: 'c-rent', month: '2026-01-01', amountCents: 90000 }],
      items: [{ ...costco, categoryId: null, amountCents: 1500, totalCents: null, youPaid: false }],
    });
    expect(view.lines.map((l) => [l.name, l.spentCents, l.budgetCents])).toEqual([
      ['Rent', 0, 90000],
      ['Uncategorized', 1500, null],
    ]);
    expect(view).toMatchObject({
      spentCents: 1500,
      budgetCents: 90000,
      budgetedSpentCents: 0,
      leftCents: 90000,
      daysLeft: null,
    });
  });

  it('has no budget total when nothing is budgeted, and goes negative when over', () => {
    const none = buildBudgetView({
      month: '2026-10-01',
      today: '2026-10-19',
      categories,
      budgets: [],
      items: [costco],
    });
    expect(none).toMatchObject({ budgetCents: null, leftCents: null });
    const over = buildBudgetView({
      month: '2026-10-01',
      today: '2026-10-19',
      categories,
      budgets: [{ categoryId: 'c-groceries', month: '2026-10-01', amountCents: 5000 }],
      items: [costco],
    });
    expect(over.leftCents).toBe(-3300);
  });

  it('measures the budget only against categories that have one', () => {
    const view = buildBudgetView({
      month: '2026-10-01',
      today: '2026-10-19',
      categories,
      budgets: [{ categoryId: 'c-rent', month: '2026-10-01', amountCents: 90000 }],
      items: [
        costco,
        {
          ...costco,
          itemId: 'e-rent',
          expenseId: 'e-rent',
          categoryId: 'c-rent',
          amountCents: 85000,
        },
      ],
    });
    expect(view).toMatchObject({
      spentCents: 93300,
      budgetCents: 90000,
      budgetedSpentCents: 85000,
      leftCents: 5000,
    });
  });
});

describe('shortMoney', () => {
  it('drops .00 only', () => {
    expect(shortMoney(8300)).toBe('$83');
    expect(shortMoney(8350)).toBe('$83.50');
    expect(shortMoney(123400)).toBe('$1,234');
  });
});
