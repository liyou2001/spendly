import { describe, expect, it } from 'vitest';

import { validateProfile, validateUsername, validateZelle } from './profile';

describe('validateUsername', () => {
  it('cleans up what was typed: a leading @, spaces and capitals', () => {
    expect(validateUsername('  @Jeff_K ')).toEqual({ ok: true, username: 'jeff_k' });
    expect(validateUsername('leo.kim2')).toEqual({ ok: true, username: 'leo.kim2' });
  });

  it('treats blank as nothing typed yet', () => {
    expect(validateUsername('  ')).toEqual({ ok: false, error: null });
    expect(validateUsername('@')).toEqual({ ok: false, error: null });
  });

  it('explains what is wrong, with the same rules as the database', () => {
    expect(validateUsername('jo')).toEqual({
      ok: false,
      error: 'Usernames are at least 3 characters.',
    });
    expect(validateUsername('a'.repeat(21))).toEqual({
      ok: false,
      error: 'Usernames are at most 20 characters.',
    });
    expect(validateUsername('jeff kim')).toEqual({
      ok: false,
      error: 'Use only letters, numbers, _ and .',
    });
    expect(validateUsername('jeff-k').ok).toBe(false);
    expect(validateUsername('a'.repeat(20)).ok).toBe(true);
  });
});

describe('validateProfile', () => {
  const form = {
    display_name: 'Leo',
    username: '@Leo',
    venmo_username: '@leo-k',
    paypal_username: 'paypal.me/leok',
    cashapp_tag: '$leok',
    zelle_contact: ' Leo@Example.com ',
  };

  it('cleans every field, including the username', () => {
    expect(validateProfile(form)).toEqual({
      ok: true,
      values: {
        display_name: 'Leo',
        username: 'leo',
        venmo_username: 'leo-k',
        paypal_username: 'leok',
        cashapp_tag: 'leok',
        zelle_contact: 'leo@example.com',
      },
    });
  });

  it('requires a username', () => {
    expect(validateProfile({ ...form, username: '' })).toEqual({
      ok: false,
      errors: { username: 'Choose a username.' },
    });
  });
});

describe('validateZelle', () => {
  it('takes an email or a US phone number, cleaned up', () => {
    expect(validateZelle(' Leo@Example.com ')).toEqual({ ok: true, contact: 'leo@example.com' });
    expect(validateZelle('(608) 555-0123')).toEqual({ ok: true, contact: '+16085550123' });
    expect(validateZelle('')).toEqual({ ok: true, contact: null });
  });

  it('refuses anything else, including numbers outside the US', () => {
    expect(validateZelle('leo@')).toEqual({
      ok: false,
      error: 'That doesn’t look like an email address.',
    });
    expect(validateZelle('+447700900123').ok).toBe(false);
    expect(validateZelle('leo').ok).toBe(false);
  });
});
