import { describe, expect, it } from 'vitest';

import {
  expensesBehind,
  paymentLink,
  paymentNote,
  requestMessage,
  type OwedExpense,
} from './requests';

const costco: OwedExpense = {
  merchant: 'Costco',
  expenseDate: '2026-10-17',
  amountCents: 1500,
  itemNames: ['Paper towels', 'Dish soap', 'Trash bags'],
};
const target: OwedExpense = {
  merchant: 'Target',
  expenseDate: '2026-10-20',
  amountCents: 2000,
  itemNames: [],
};
const pizza: OwedExpense = {
  merchant: 'Pizza',
  expenseDate: '2026-10-22',
  amountCents: 1000,
  itemNames: [],
};

describe('paymentLink', () => {
  it('builds the Venmo link from the plan, with a vague note', () => {
    expect(paymentLink({ venmo: 'leo-k', paypal: null, cashtag: null }, 1500, 'Costco 10/17')).toBe(
      'https://venmo.com/leo-k?txn=pay&amount=15.00&note=Costco%2010%2F17&audience=private',
    );
  });

  it('falls back to PayPal, then Cash App, then nothing', () => {
    expect(paymentLink({ venmo: null, paypal: 'leok', cashtag: 'leok' }, 4250, 'x')).toBe(
      'https://paypal.me/leok/42.50USD',
    );
    expect(paymentLink({ venmo: null, paypal: null, cashtag: 'leok' }, 4250, 'x')).toBe(
      'https://cash.app/$leok/42.50',
    );
    expect(paymentLink({ venmo: null, paypal: null, cashtag: null }, 4250, 'x')).toBeNull();
  });
});

describe('paymentNote', () => {
  it('names one expense by merchant and date, or the newest plus a count', () => {
    expect(paymentNote([costco])).toBe('Costco 10/17');
    expect(paymentNote([pizza, target, costco])).toBe('Pizza + 2 more');
    expect(paymentNote([])).toBe('Spendly');
  });
});

describe('expensesBehind', () => {
  it('takes the newest expenses until they cover what is owed', () => {
    const newestFirst = [pizza, target, costco];
    expect(expensesBehind(newestFirst, 1000)).toEqual([pizza]);
    expect(expensesBehind(newestFirst, 1001)).toEqual([pizza, target]);
    expect(expensesBehind(newestFirst, 9999)).toEqual([pizza, target, costco]);
  });
});

describe('requestMessage', () => {
  it('matches the plan’s example for one expense with a few items', () => {
    expect(
      requestMessage({
        firstName: 'Jeff',
        owedCents: 1500,
        expenses: [costco],
        link: 'https://pay.spendly.app/#abc',
      }),
    ).toBe(
      'Hey Jeff, you owe $15.00 for Costco (paper towels, dish soap and trash bags). See your share and pay here: https://pay.spendly.app/#abc',
    );
  });

  it('uses the date when there are no items or too many', () => {
    expect(
      requestMessage({ firstName: 'Maya', owedCents: 2000, expenses: [target], link: null }),
    ).toBe('Hey Maya, you owe $20.00 for Target on 10/20. Thanks!');
    const many = { ...costco, itemNames: ['a', 'b', 'c', 'd'] };
    expect(
      requestMessage({ firstName: 'Jeff', owedCents: 1500, expenses: [many], link: null }),
    ).toBe('Hey Jeff, you owe $15.00 for Costco on 10/17. Thanks!');
  });

  it('lists merchants for several expenses', () => {
    expect(
      requestMessage({
        firstName: 'Jeff',
        owedCents: 3000,
        expenses: [target, costco],
        link: null,
      }),
    ).toBe('Hey Jeff, you owe $30.00 for Target and Costco. Thanks!');
    expect(
      requestMessage({
        firstName: 'Jeff',
        owedCents: 4500,
        expenses: [pizza, target, costco],
        link: null,
      }),
    ).toBe('Hey Jeff, you owe $45.00 for Pizza, Target and 1 more. Thanks!');
  });
});
