import { describe, expect, it } from 'vitest';

import { supabaseUrl } from './api';
import {
  amountDue,
  firstName,
  formatDay,
  formatZelle,
  itemNote,
  paymentNote,
  tokenFromHash,
} from './view';

const costco = {
  merchant: 'Costco',
  expense_date: '2026-10-17',
  amount_cents: 1500,
  items: [{ name: 'Paper towels', amount_cents: 2299, split_count: 3 }],
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

  it('formats names, days and item notes', () => {
    expect(firstName('Jeff Kim')).toBe('Jeff');
    expect(formatDay('2026-10-17')).toBe('Oct 17');
    expect(itemNote({ name: 'Paper towels', amount_cents: 2299, split_count: 3 })).toBe(
      'Split 3 ways',
    );
    expect(itemNote({ name: 'Hat', amount_cents: 999, split_count: 1 })).toBeNull();
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
