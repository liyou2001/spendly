import { describe, expect, it } from 'vitest';

import { dedupePeople, oneOffName } from './oneOff';

describe('oneOffName', () => {
  it('names a quick split after who was there and the date', () => {
    expect(oneOffName(['Jeff'], '2026-10-19')).toBe('Jeff · Oct 19');
    expect(oneOffName(['Jeff', 'Maya'], '2026-10-19')).toBe('Jeff and Maya · Oct 19');
    expect(oneOffName(['Jeff', 'Maya', 'Sam'], '2026-10-19')).toBe('Jeff, Maya and Sam · Oct 19');
    expect(oneOffName(['Jeff', 'Maya', 'Sam', 'Ana'], '2026-10-19')).toBe(
      'Jeff, Maya and 2 others · Oct 19',
    );
  });
});

describe('dedupePeople', () => {
  it('keeps one copy of each person, newest first, matched by phone or else by name', () => {
    const result = dedupePeople([
      { displayName: 'Jeff', phone: '+16085550123', addedAt: '2026-09-01T00:00:00Z' },
      { displayName: 'Jeffrey', phone: '+16085550123', addedAt: '2026-10-01T00:00:00Z' },
      { displayName: 'Maya', phone: null, addedAt: '2026-08-01T00:00:00Z' },
      { displayName: 'maya ', phone: null, addedAt: '2026-10-05T00:00:00Z' },
      { displayName: 'Sam', phone: null, addedAt: '2026-07-01T00:00:00Z' },
    ]);
    expect(result.map((p) => p.displayName)).toEqual(['maya ', 'Jeffrey', 'Sam']);
  });
});
