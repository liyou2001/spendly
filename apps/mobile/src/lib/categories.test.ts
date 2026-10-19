import { describe, expect, it } from 'vitest';

import { validateCategoryName } from './categories';

const existing = [
  { id: 'c1', name: 'Groceries' },
  { id: 'c2', name: 'Dining' },
];

describe('validateCategoryName', () => {
  it('accepts a new name, trimmed', () => {
    expect(validateCategoryName('  Textbooks ', existing)).toEqual({ ok: true, name: 'Textbooks' });
  });

  it('needs a name', () => {
    expect(validateCategoryName('   ', existing)).toEqual({ ok: false, error: 'Enter a name.' });
  });

  it('allows 40 characters but not 41, counting emoji as one', () => {
    expect(validateCategoryName('a'.repeat(40), existing).ok).toBe(true);
    expect(validateCategoryName('a'.repeat(41), existing)).toEqual({
      ok: false,
      error: 'Keep it to 40 characters or fewer.',
    });
    expect(validateCategoryName('🎉'.repeat(40), existing).ok).toBe(true);
  });

  it('rejects a name you already have, ignoring case', () => {
    expect(validateCategoryName('groceries', existing)).toEqual({
      ok: false,
      error: 'You already have a category called Groceries.',
    });
  });

  it('lets a category be renamed to its own name in different capitalization', () => {
    expect(validateCategoryName('GROCERIES', existing, 'c1')).toEqual({
      ok: true,
      name: 'GROCERIES',
    });
    expect(validateCategoryName('dining', existing, 'c1').ok).toBe(false);
  });
});
