import { describe, expect, it } from 'vitest';

import { supabaseUrl } from './api';
import {
  amountDue,
  firstName,
  formatDay,
  formatZelle,
  explainYours,
  itemTitle,
  paymentNote,
  tokenFromHash,
  whoFor,
} from './view';

const person = (ref: string, name: string, you = false) => ({ ref, name, you });
const line = (name: string, amount_cents: number, refs: string[], extra = {}) => ({
  name,
  amount_cents,
  kind: 'item' as const,
  quantity: 1,
  by_units: false,
  people: refs.map((ref) => ({ ref, units: 1 })),
  ...extra,
});
const costco = {
  merchant: 'Costco',
  expense_date: '2026-10-17',
  total_cents: 14000,
  amount_cents: 1500,
  people: [person('p001', 'Leo'), person('p002', 'Jeff', true), person('p003', 'Maya')],
  items: [
    line('Protein powder', 4799, ['p001']),
    line('Graphic tee', 1299, ['p001']),
    line('Granola bars', 702, ['p001']),
    line('Paper towels', 2299, ['p001', 'p002', 'p003']),
    line('Dish soap', 1149, ['p001', 'p002', 'p003']),
    line('Trash bags', 1052, ['p001', 'p002', 'p003']),
    line('Oat milk', 1249, ['p003']),
    line('Hummus', 899, ['p003']),
    line('Veggie chips', 552, ['p003']),
  ],
  shares: [
    { ref: 'p001', amount_cents: 8300 },
    { ref: 'p002', amount_cents: 1500 },
    { ref: 'p003', amount_cents: 4200 },
  ],
};

describe('view', () => {
  it('reads the token from the fragment only when it looks like one', () => {
    expect(tokenFromHash('#abcdefghijklmnopqrstuvwxyz012-_A')).toBe(
      'abcdefghijklmnopqrstuvwxyz012-_A',
    );
    expect(tokenFromHash('#short')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });

  it('takes claims waiting to be confirmed off what’s due, never below zero', () => {
    expect(amountDue({ owed_cents: 1500, pending_cents: 0 })).toBe(1500);
    expect(amountDue({ owed_cents: 1500, pending_cents: 1000 })).toBe(500);
    expect(amountDue({ owed_cents: 0, pending_cents: 0 })).toBe(0);
    expect(amountDue({ owed_cents: -300, pending_cents: 0 })).toBe(0);
  });

  it('formats names and days', () => {
    expect(firstName('Jeff Kim')).toBe('Jeff');
    expect(formatDay('2026-10-17')).toBe('Oct 17');
  });

  it('explains Jeff’s $15.00 from the whole Costco receipt', () => {
    const jeff = explainYours(costco);
    expect(jeff?.items).toEqual([
      { title: 'Paper towels', detail: '$22.99 split 3 ways', cents: 766 },
      { title: 'Dish soap', detail: '$11.49 split 3 ways', cents: 383 },
      { title: 'Trash bags', detail: '$10.52 split 3 ways', cents: 351 },
    ]);
    expect(jeff?.totalCents).toBe(1500);
  });

  it('adds tax by percent and still matches the share', () => {
    const withTax = {
      ...costco,
      items: [...costco.items, { ...line('Tax', 700, []), kind: 'tax' as const }],
    };
    const jeff = explainYours(withTax);
    expect(jeff?.percent).toBe('10.7%');
    expect(jeff?.adjustments[0]).toMatchObject({ title: 'Tax', detail: '10.7% of $7.00' });
    expect(jeff?.totalCents).toBe(1500 + (jeff?.adjustments[0]?.cents ?? 0));
  });

  it('says who each item was for', () => {
    const [protein, , , towels] = costco.items;
    if (!protein || !towels) throw new Error('missing items');
    expect(whoFor(protein, costco)).toBe('Leo');
    expect(whoFor(towels, costco)).toBe('All 3');
    expect(whoFor(line('Gift', 500, ['p001', 'p003']), costco)).toBe('Leo and Maya');
    const drinks = line('Soft drink', 750, [], {
      quantity: 3,
      by_units: true,
      people: [
        { ref: 'p002', units: 2 },
        { ref: 'p003', units: 1 },
      ],
    });
    expect(whoFor(drinks, costco)).toBe('Jeff 2, Maya 1');
    expect(itemTitle(drinks)).toBe('3 × Soft drink');
  });

  it('shows Zelle phone numbers the familiar way', () => {
    expect(formatZelle('+16085550123')).toBe('(608) 555-0123');
    expect(formatZelle('leo@example.com')).toBe('leo@example.com');
  });

  it('keeps the payment app note vague', () => {
    expect(paymentNote([costco])).toBe('Costco 10/17');
    expect(paymentNote([costco, { ...costco, merchant: 'Target' }])).toBe('Costco + 1 more');
    expect(paymentNote([])).toBe('Spendly');
  });

  it('uses local Supabase on the same computer when no URL is set', () => {
    expect(supabaseUrl(undefined, { hostname: '10.0.0.5' }, false)).toBe('http://10.0.0.5:54321');
    expect(supabaseUrl('https://abc.supabase.co/', { hostname: 'x' }, true)).toBe(
      'https://abc.supabase.co',
    );
  });

  it('refuses to guess in a deployed page without a Supabase URL', () => {
    expect(() => supabaseUrl(undefined, { hostname: 'pay.example.com' }, true)).toThrow(
      'This page isn’t set up yet',
    );
  });
});
