import { describe, expect, it } from 'vitest';

import { paymentAppLinks } from './paymentLinks';

describe('paymentAppLinks', () => {
  it('gives every app the person takes, Venmo first, with the amount filled in', () => {
    expect(
      paymentAppLinks({ venmo: 'leo-k', paypal: 'leok', cashtag: '$leok' }, 1500, 'Costco 10/17'),
    ).toEqual([
      {
        app: 'venmo',
        label: 'Venmo',
        url: 'https://venmo.com/leo-k?txn=pay&amount=15.00&note=Costco%2010%2F17&audience=private',
      },
      { app: 'paypal', label: 'PayPal', url: 'https://paypal.me/leok/15.00USD' },
      { app: 'cashapp', label: 'Cash App', url: 'https://cash.app/$leok/15.00' },
    ]);
  });

  it('is empty without any usernames', () => {
    expect(paymentAppLinks({ venmo: null, paypal: null, cashtag: null }, 1500, 'x')).toEqual([]);
  });
});
