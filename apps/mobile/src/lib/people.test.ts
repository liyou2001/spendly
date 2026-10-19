import { describe, expect, it } from 'vitest';

import type { Group, Payment } from './data';
import { buildPeopleView, statusLine } from './people';

const apartment: Group = {
  id: 'g-apt',
  name: 'Apartment',
  isPersonal: false,
  people: [
    { id: 'leo', displayName: 'Leo', userId: 'u-leo', phone: null },
    { id: 'jeff', displayName: 'Jeff', userId: null, phone: '+16085551234' },
    { id: 'maya', displayName: 'Maya', userId: null, phone: null },
  ],
};
const trip: Group = {
  id: 'g-trip',
  name: 'Ski trip',
  isPersonal: false,
  people: [
    { id: 'leo-trip', displayName: 'Leo', userId: 'u-leo', phone: null },
    { id: 'priya', displayName: 'Priya', userId: 'u-priya', phone: null },
  ],
};
const personal: Group = {
  id: 'g-personal',
  name: 'Personal',
  isPersonal: true,
  people: [{ id: 'leo-solo', displayName: 'Leo', userId: 'u-leo', phone: null }],
};

const now = new Date('2026-10-20T12:00:00Z');
const payment = (overrides: Partial<Payment>): Payment => ({
  id: 'p1',
  groupId: 'g-apt',
  from: 'jeff',
  to: 'leo',
  amountCents: 1500,
  kind: 'payment',
  status: 'confirmed',
  method: 'venmo',
  createdAt: '2026-10-19T10:00:00Z',
  decidedAt: '2026-10-19T10:00:00Z',
  ...overrides,
});

const view = (
  balances: { groupId: string; from: string; to: string; amountCents: number }[],
  payments: Payment[] = [],
) =>
  buildPeopleView({
    userId: 'u-leo',
    groups: [apartment, trip, personal],
    balances,
    payments,
    now,
  });

describe('buildPeopleView', () => {
  it('shows the seed: Jeff owes you $15.00 and Maya owes you $42.00', () => {
    const result = view([
      { groupId: 'g-apt', from: 'jeff', to: 'leo', amountCents: 1500 },
      { groupId: 'g-apt', from: 'maya', to: 'leo', amountCents: 4200 },
    ]);
    expect(result.owedToMeCents).toBe(5700);
    expect(result.iOweCents).toBe(0);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.people.map((p) => [p.name, p.netCents])).toEqual([
      ['Maya', 4200],
      ['Jeff', 1500],
    ]);
  });

  it('totals what you owe across groups, and leaves out Personal', () => {
    const result = view([
      { groupId: 'g-apt', from: 'jeff', to: 'leo', amountCents: 1500 },
      { groupId: 'g-trip', from: 'leo-trip', to: 'priya', amountCents: 3000 },
    ]);
    expect(result.owedToMeCents).toBe(1500);
    expect(result.iOweCents).toBe(3000);
    expect(result.groups.map((g) => g.name)).toEqual(['Apartment', 'Ski trip']);
    expect(result.groups[1]?.people[0]?.netCents).toBe(-3000);
  });

  it('moves someone who just paid in full to Recently settled', () => {
    const result = view(
      [{ groupId: 'g-apt', from: 'maya', to: 'leo', amountCents: 4200 }],
      [payment({})],
    );
    expect(result.groups[0]?.people.map((p) => p.name)).toEqual(['Maya']);
    expect(result.recentlySettled.map((p) => [p.name, p.lastSettledAt])).toEqual([
      ['Jeff', '2026-10-19T10:00:00Z'],
    ]);
  });

  it('drops settled people after 30 days, and never lists people with no history', () => {
    const old = payment({ decidedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' });
    const result = view([], [old]);
    expect(result.recentlySettled).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it('keeps someone with a waiting claim in their group even at zero', () => {
    const claim = payment({
      status: 'claimed',
      decidedAt: null,
      from: 'leo-trip',
      to: 'priya',
      groupId: 'g-trip',
    });
    const result = view([], [claim]);
    expect(result.groups[0]?.people[0]?.claimsFromMe).toEqual([claim]);
  });

  it('ignores rejected payments when deciding who recently settled', () => {
    const rejected = payment({ status: 'rejected' });
    expect(view([], [rejected]).recentlySettled).toEqual([]);
  });
});

describe('statusLine', () => {
  const base = buildPeopleView({
    userId: 'u-leo',
    groups: [apartment],
    balances: [{ groupId: 'g-apt', from: 'jeff', to: 'leo', amountCents: 4250 }],
    payments: [],
    now,
  }).groups[0]!.people[0]!;

  it('says who owes whom', () => {
    expect(statusLine(base)).toBe('Owes you');
    expect(statusLine({ ...base, netCents: -100 })).toBe('You owe');
    expect(statusLine({ ...base, netCents: 0 })).toBe('Settled up');
  });

  it('puts a waiting claim first', () => {
    const claim = payment({ status: 'claimed', decidedAt: null, amountCents: 2000 });
    expect(statusLine({ ...base, claimsToMe: [claim] })).toBe(
      'Says they paid $20.00 · tap to confirm',
    );
    expect(statusLine({ ...base, claimsFromMe: [claim] })).toBe(
      'You said you paid $20.00 · waiting for Jeff',
    );
  });
});
