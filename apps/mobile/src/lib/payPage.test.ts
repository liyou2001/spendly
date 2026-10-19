import { describe, expect, it } from 'vitest';

import { payPageUrl } from './payPage';

describe('payPageUrl', () => {
  it('uses the deployed page when configured, with the token in the fragment', () => {
    expect(payPageUrl('abc', 'https://pay.spendly.app/', '10.0.0.5:8081')).toBe(
      'https://pay.spendly.app/#abc',
    );
  });

  it('falls back to the dev server on the computer running Expo', () => {
    expect(payPageUrl('abc', undefined, '10.0.0.5:8081')).toBe('http://10.0.0.5:5173/#abc');
    expect(payPageUrl('abc', '', '10.0.0.5:8081')).toBe('http://10.0.0.5:5173/#abc');
  });

  it('has no link through a tunnel without a deployed page', () => {
    expect(payPageUrl('abc', undefined, 'abc.exp.direct')).toBeNull();
  });
});
