import { describe, expect, it } from 'vitest';

import { debtLabel, joinNames } from './labels';

describe('joinNames', () => {
  it('joins with commas and a final "and"', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Jeff'])).toBe('Jeff');
    expect(joinNames(['Jeff', 'Maya'])).toBe('Jeff and Maya');
    expect(joinNames(['Leo', 'Jeff', 'Maya'])).toBe('Leo, Jeff and Maya');
  });
});

describe('debtLabel', () => {
  const names: Record<string, string> = { jeff: 'Jeff', maya: 'Maya' };
  const nameOf = (id: string) => names[id] ?? 'Someone';

  it('describes a debt from the viewer’s side', () => {
    expect(debtLabel({ from: 'jeff', to: 'me' }, 'me', nameOf)).toBe('Jeff owes you');
    expect(debtLabel({ from: 'me', to: 'maya' }, 'me', nameOf)).toBe('You owe Maya');
    expect(debtLabel({ from: 'jeff', to: 'maya' }, 'me', nameOf)).toBe('Jeff owes Maya');
  });
});
