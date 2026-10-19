import { describe, expect, it } from 'vitest';

import { categoryForReceipt, draftFromReceipt, totalCheck, type ScannedReceipt } from './receipts';
import { buildSplit, type Draft } from './split';

const empty: Draft = {
  mode: 'quick',
  items: [],
  tax: null,
  tip: null,
  discount: null,
  quickTotal: '',
  quickSplit: 'even',
  quickPeople: [],
  quickAmounts: {},
};

const receipt: ScannedReceipt = {
  merchant: 'Costco',
  date: '2026-10-17',
  items: [
    { name: 'Paper towels', amount_cents: 2299 },
    { name: 'Dish soap', amount_cents: 1149 },
  ],
  tax_cents: 276,
  tip_cents: 0,
  discount_cents: 300,
  total_cents: 3424,
  category: 'Groceries',
};

const categories = [
  { id: 'c-groceries', name: 'Groceries' },
  { id: 'c-dining', name: 'Dining' },
  { id: 'c-transport', name: 'Transport' },
  { id: 'c-books', name: 'Books' },
];

describe('draftFromReceipt', () => {
  it('fills an itemized draft whose total matches the receipt', () => {
    const draft = draftFromReceipt(receipt, empty);
    expect(draft.mode).toBe('items');
    expect(draft.items.map((i) => [i.name, i.amount, i.assignment.kind])).toEqual([
      ['Paper towels', '22.99', 'you'],
      ['Dish soap', '11.49', 'you'],
    ]);
    expect([draft.tax, draft.tip, draft.discount]).toEqual(['2.76', null, '3.00']);
    const people = { me: 'p-me', everyone: ['p-me'] };
    expect(buildSplit(draft, people).totalCents).toBe(3424);
  });

  it('uses the phone’s decimal separator', () => {
    expect(draftFromReceipt(receipt, empty, { decimalSeparator: ',' }).items[0]?.amount).toBe(
      '22,99',
    );
  });
});

describe('categoryForReceipt', () => {
  it('trusts a merchant rule over Claude’s suggestion', () => {
    expect(categoryForReceipt('Costco Wholesale', 'Books', categories)).toBe('c-groceries');
    expect(categoryForReceipt('Uber Eats', null, categories)).toBe('c-dining');
    expect(categoryForReceipt('Uber', null, categories)).toBe('c-transport');
  });

  it('falls back to the suggestion if it’s one of your categories, else nothing', () => {
    expect(categoryForReceipt('Half Price Books', 'books', categories)).toBe('c-books');
    expect(categoryForReceipt('Half Price Books', 'Shopping', categories)).toBeNull();
    expect(categoryForReceipt(null, null, categories)).toBeNull();
  });

  it('skips a rule whose category you deleted', () => {
    expect(categoryForReceipt('Starbucks', 'Groceries', [categories[0]!])).toBe('c-groceries');
  });
});

describe('totalCheck', () => {
  it('says nothing when the lines match, and how far off they are when not', () => {
    expect(totalCheck(14000, 14000)).toBeNull();
    expect(totalCheck(14000, null)).toBeNull();
    expect(totalCheck(14000, 13950)).toBe(
      'These lines add up to $139.50, but the receipt says $140.00 ($0.50 short). Check the amounts against your receipt.',
    );
  });
});
