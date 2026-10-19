import { describe, expect, it } from 'vitest';

import { usernameCheckFor } from './usernameCheck';

const jeff = { userId: 'u-jeff', displayName: 'Jeff Kim', username: 'jeff_k' };

describe('usernameCheckFor', () => {
  it('shows nothing for blank, and format errors without a lookup', () => {
    expect(usernameCheckFor('', 'find', null, null)).toEqual({
      check: { status: 'empty' },
      lookup: null,
    });
    expect(usernameCheckFor('jo', 'find', null, null)).toEqual({
      check: { status: 'invalid', message: 'Usernames are at least 3 characters.' },
      lookup: null,
    });
  });

  it('is checking until a lookup for that exact username comes back', () => {
    expect(usernameCheckFor('@Jeff_K', 'find', null, null)).toEqual({
      check: { status: 'checking' },
      lookup: 'jeff_k',
    });
    const stale = { username: 'jeff', check: { status: 'notFound' as const } };
    expect(usernameCheckFor('jeff_k', 'find', null, stale).check).toEqual({ status: 'checking' });
  });

  it('shows the lookup result for the username typed', () => {
    const found = { username: 'jeff_k', check: { status: 'found' as const, user: jeff } };
    expect(usernameCheckFor('jeff_k', 'find', null, found).check).toEqual({
      status: 'found',
      user: jeff,
    });
  });

  it('treats your own current username as available, without a lookup', () => {
    expect(usernameCheckFor('@Leo', 'available', 'leo', null)).toEqual({
      check: { status: 'available' },
      lookup: null,
    });
    expect(usernameCheckFor('leo', 'find', 'leo', null).lookup).toBe('leo');
  });
});
