import { describe, expect, it } from 'vitest';

import { debtLabel, evenSplitMessage, itemTitle, joinNames, yourPartOf } from './labels';

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

describe('items with a quantity', () => {
  it('shows the count before the name only when there are several', () => {
    expect(itemTitle('Soft drink', 3)).toBe('3 × Soft drink');
    expect(itemTitle('Hummus', 1)).toBe('Hummus');
  });

  it('describes your part: by count, evenly, or all yours', () => {
    expect(yourPartOf({ splitCount: 2, myUnits: 2, totalUnits: 3 })).toBe('Your 2 of 3');
    expect(yourPartOf({ splitCount: 3, myUnits: 1, totalUnits: 3 })).toBe('Split 3 ways');
    expect(yourPartOf({ splitCount: 1, myUnits: 1, totalUnits: 1 })).toBeNull();
  });
});

describe('evenSplitMessage', () => {
  const you = { name: 'You', you: true };
  const jeff = { name: 'Jeff', you: false };
  const maya = { name: 'Maya', you: false };
  const message = (people: { name: string; you: boolean }[], everyone = false, quantity = 1) =>
    evenSplitMessage({ people, everyone, quantity });

  it('says who shares it, or who pays for it when only one is left', () => {
    expect(message([you, jeff, maya], true)).toBe('Split equally between everyone.');
    expect(message([you, jeff])).toBe('Split equally between You and Jeff.');
    expect(message([jeff], false, 3)).toBe('Jeff is paying for all 3.');
    expect(message([jeff])).toBe('Jeff is paying for this.');
    expect(message([you], false, 2)).toBe('You’re paying for all 2.');
  });

  it('goes by who you are, not by name', () => {
    expect(message([{ name: 'You', you: false }])).toBe('You is paying for this.');
  });
});
