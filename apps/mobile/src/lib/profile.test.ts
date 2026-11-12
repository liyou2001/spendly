import { describe, expect, it } from 'vitest';

import { validateName, validateProfile, validateUsername } from './profile';

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
    first_name: ' Leo ',
    last_name: 'Li',
    username: '@Leo',
    venmo_username: '@leo-k',
    paypal_username: 'paypal.me/leok',
    cashapp_tag: '$leok',
  };

  it('cleans every field, including the username', () => {
    expect(validateProfile(form)).toEqual({
      ok: true,
      values: {
        first_name: 'Leo',
        last_name: 'Li',
        username: 'leo',
        venmo_username: 'leo-k',
        paypal_username: 'leok',
        cashapp_tag: 'leok',
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

describe('validateName', () => {
  it('trims both names', () => {
    expect(validateName(' Leo ', ' Li ')).toEqual({ ok: true, first: 'Leo', last: 'Li' });
  });

  it('requires both, up to 40 characters each, like the database', () => {
    expect(validateName('', '')).toEqual({
      ok: false,
      errors: { first_name: 'Enter your first name.', last_name: 'Enter your last name.' },
    });
    expect(validateName('Leo', 'L'.repeat(41))).toEqual({
      ok: false,
      errors: { last_name: 'Keep it to 40 characters.' },
    });
    expect(validateName('Leo', 'L'.repeat(40)).ok).toBe(true);
  });
});
