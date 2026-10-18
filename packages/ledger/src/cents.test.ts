import { describe, expect, it } from 'vitest';

import { formatCents, isCents, parseCents } from './cents';
import { LedgerError } from './errors';

describe('isCents', () => {
  it('accepts whole cents', () => {
    expect(isCents(1500)).toBe(true);
    expect(isCents(0)).toBe(true);
    expect(isCents(-299)).toBe(true);
  });

  it('rejects fractional, non-finite and unsafe values', () => {
    expect(isCents(15.5)).toBe(false);
    expect(isCents(Number.NaN)).toBe(false);
    expect(isCents(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

describe('parseCents', () => {
  it.each([
    ['$12.34', 1234],
    ['12.34', 1234],
    ['12', 1200],
    ['12.3', 1230],
    ['12.', 1200],
    ['.99', 99],
    ['$0.05', 5],
    ['0', 0],
    ['007', 700],
    ['1,234.56', 123456],
    ['$1,000,000', 100000000],
    ['  15.00  ', 1500],
  ])('parses %j as %i cents', (input, cents) => {
    expect(parseCents(input)).toBe(cents);
  });

  it.each([
    '',
    '   ',
    '$',
    '.',
    '$.',
    'abc',
    '12a',
    '12.345',
    '1.2.3',
    '-5',
    '+5',
    '$-5',
    '5$',
    '$ 12',
    '1 000',
    '1,23',
    '1234,567',
    ',123',
    '1e3',
    '0x10',
    'Infinity',
    'NaN',
    '１２', // full-width digits
  ])('rejects %j', (input) => {
    expect(parseCents(input)).toBeNull();
  });

  it('rejects amounts too large to hold exactly', () => {
    expect(parseCents('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseCents('90071992547409.92')).toBeNull();
    expect(parseCents('99999999999999999999')).toBeNull();
  });

  it('round-trips with formatCents', () => {
    for (const cents of [0, 1, 99, 100, 1500, 123456, 100000000]) {
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });
});

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [99, '$0.99'],
    [1500, '$15.00'],
    [8300, '$83.00'],
    [100000, '$1,000.00'],
    [123456789, '$1,234,567.89'],
    [-1500, '-$15.00'],
    [-5, '-$0.05'],
  ])('formats %i as %j', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('throws on anything that is not whole cents', () => {
    expect(() => formatCents(15.5)).toThrow(LedgerError);
    expect(() => formatCents(Number.NaN)).toThrow(LedgerError);
  });
});
