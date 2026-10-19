import { describe, expect, it } from 'vitest';

import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['(608) 555-1234', '+16085551234'],
    ['608.555.1234', '+16085551234'],
    ['1 608 555 1234', '+16085551234'],
    ['+1 608 555 1234', '+16085551234'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('turns %j into %j', (input, phone) => {
    expect(normalizePhone(input)).toEqual({ ok: true, phone });
  });

  it('treats blank as no phone number', () => {
    expect(normalizePhone('   ')).toEqual({ ok: true, phone: null });
  });

  it.each(['555-1234', '608-555-12345', 'call me', '+0 123 4567', '+1234'])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input).ok).toBe(false);
    },
  );
});

describe('formatPhone', () => {
  it('shows US numbers the familiar way and leaves others alone', () => {
    expect(formatPhone('+16085550123')).toBe('(608) 555-0123');
    expect(formatPhone('+447700900123')).toBe('+447700900123');
  });
});
