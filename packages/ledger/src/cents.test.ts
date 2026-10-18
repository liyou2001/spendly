import { describe, expect, it } from 'vitest';

import { isCents } from './cents';

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
