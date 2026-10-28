import { describe, expect, it } from 'vitest';

import {
  categoryForReceipt,
  draftFromReceipt,
  hasEnteredDetails,
  type ScannedReceipt,
  scansLeftLabel,
  totalCheck,
} from './receipts';
import { buildSplit, type Draft, type DraftItem } from './split';

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
    { name: 'Paper towels', quantity: 1, amount_cents: 2299 },
    { name: 'Dish soap', quantity: 2, amount_cents: 1149 },
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
    expect(draft.items.map((i) => [i.quantity, i.name, i.amount, i.assignment.kind])).toEqual([
      ['', 'Paper towels', '22.99', 'you'],
      ['2', 'Dish soap', '11.49', 'you'],
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

describe('hasEnteredDetails', () => {
  const blank: DraftItem = {
    key: 'k',
    name: '',
    amount: '',
    quantity: '',
    assignment: { kind: 'you' },
  };

  it('is false for a fresh form, so scanning goes straight ahead', () => {
    expect(hasEnteredDetails({ ...empty, mode: 'items', items: [blank] }, '  ')).toBe(false);
  });

  it('is true once anything a scan would replace is entered', () => {
    const withItems = (patch: Partial<DraftItem>) => ({
      ...empty,
      items: [{ ...blank, ...patch }],
    });
    expect(hasEnteredDetails(empty, 'Costco')).toBe(true);
    expect(hasEnteredDetails(withItems({ name: 'Milk' }), '')).toBe(true);
    expect(hasEnteredDetails(withItems({ amount: '3' }), '')).toBe(true);
    expect(hasEnteredDetails(withItems({ assignment: { kind: 'all' } }), '')).toBe(true);
    expect(hasEnteredDetails({ ...empty, tax: '1.00' }, '')).toBe(true);
    expect(hasEnteredDetails({ ...empty, quickTotal: '20' }, '')).toBe(true);
  });
});

describe('scansLeftLabel', () => {
  const allowance = { left: 32, limit: 40, resetsOn: '2026-11-01' };

  it('is a quiet count most of the time', () => {
    expect(scansLeftLabel(allowance)).toEqual({
      text: '32 scans left this month',
      low: false,
      none: false,
    });
  });

  it('flags the last few, in the singular for one', () => {
    expect(scansLeftLabel({ ...allowance, left: 5 })).toMatchObject({ low: true, none: false });
    expect(scansLeftLabel({ ...allowance, left: 1 }).text).toBe('1 scan left this month');
  });

  it('with none left, says what to do and when scans come back', () => {
    expect(scansLeftLabel({ ...allowance, left: 0 })).toEqual({
      text: 'You’ve used all 40 scans this month. Enter this one by hand. Scans come back Nov 1.',
      low: true,
      none: true,
    });
  });

  it('after the last scan reads, doesn’t say to enter it by hand', () => {
    expect(scansLeftLabel({ ...allowance, left: 0 }, 'read').text).toBe(
      'That was your last scan this month. Scans come back Nov 1.',
    );
    // An error already says to enter it by hand.
    expect(scansLeftLabel({ ...allowance, left: 0 }, 'error').text).toBe('Scans come back Nov 1.');
  });

  it('reads right for any limit, or none known', () => {
    expect(scansLeftLabel({ left: 0, limit: 1, resetsOn: '2026-11-01' }).text).toBe(
      'You’ve used your one scan this month. Enter this one by hand. Scans come back Nov 1.',
    );
    expect(scansLeftLabel({ left: 0, limit: 0, resetsOn: '2026-11-01' }).text).toBe(
      'Receipt scanning is off for now.',
    );
    expect(scansLeftLabel({ left: 0, limit: null, resetsOn: null }).text).toBe(
      'You’ve used all your scans this month. Enter this one by hand.',
    );
    expect(scansLeftLabel({ left: 0, limit: null, resetsOn: null }, 'error').text).toBe('');
  });
});
