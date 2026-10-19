// The People tab's view of your balances: who owes whom, pending claims, and who recently
// settled up. Pure, so it can be tested without a database.
import { formatCents, type Cents, type Debt } from '@spendly/ledger';

import type { Group, Payment } from './data';

/** How long someone stays under "Recently settled" after their balance reaches zero. */
export const RECENTLY_SETTLED_DAYS = 30;

export interface PersonBalance {
  groupId: string;
  groupName: string;
  participantId: string;
  name: string;
  /** Positive: they owe you. Negative: you owe them. */
  netCents: Cents;
  /** Claims they made that you haven't decided yet. */
  claimsToMe: Payment[];
  /** Claims you made that they haven't decided yet. */
  claimsFromMe: Payment[];
  /** When the last confirmed payment or forgiveness between you happened. */
  lastSettledAt: string | null;
}

export interface PeopleView {
  owedToMeCents: Cents;
  iOweCents: Cents;
  /** Shared groups with anyone who owes or is owed, or has a claim waiting. */
  groups: { groupId: string; name: string; people: PersonBalance[] }[];
  /** People you're square with who had a payment or forgiveness recently, newest first. */
  recentlySettled: PersonBalance[];
}

export function buildPeopleView(input: {
  userId: string;
  groups: readonly Group[];
  balances: readonly (Debt & { groupId: string })[];
  payments: readonly Payment[];
  now: Date;
}): PeopleView {
  const cutoff = new Date(input.now.getTime() - RECENTLY_SETTLED_DAYS * 24 * 60 * 60 * 1000);
  const view: PeopleView = { owedToMeCents: 0, iOweCents: 0, groups: [], recentlySettled: [] };

  for (const group of input.groups) {
    if (group.isPersonal) continue;
    const me = group.people.find((p) => p.userId === input.userId)?.id;
    if (!me) continue;

    const people: PersonBalance[] = [];
    for (const person of group.people) {
      if (person.id === me) continue;
      const between = (from: string, to: string) =>
        input.balances
          .filter((b) => b.groupId === group.id && b.from === from && b.to === to)
          .reduce((sum, b) => sum + b.amountCents, 0);
      const netCents = between(person.id, me) - between(me, person.id);
      const ours = input.payments.filter(
        (p) =>
          p.groupId === group.id &&
          ((p.from === person.id && p.to === me) || (p.from === me && p.to === person.id)),
      );
      const settled = ours
        .filter((p) => p.status === 'confirmed')
        .map((p) => p.decidedAt ?? p.createdAt)
        .sort()
        .at(-1);

      const row: PersonBalance = {
        groupId: group.id,
        groupName: group.name,
        participantId: person.id,
        name: person.displayName,
        netCents,
        claimsToMe: ours.filter((p) => p.status === 'claimed' && p.to === me),
        claimsFromMe: ours.filter((p) => p.status === 'claimed' && p.from === me),
        lastSettledAt: settled ?? null,
      };

      if (netCents > 0) view.owedToMeCents += netCents;
      else view.iOweCents -= netCents;

      const pending = row.claimsToMe.length > 0 || row.claimsFromMe.length > 0;
      if (netCents !== 0 || pending) people.push(row);
      else if (row.lastSettledAt && new Date(row.lastSettledAt) >= cutoff) {
        view.recentlySettled.push(row);
      }
    }

    if (people.length > 0) {
      people.sort(
        (a, b) => Math.abs(b.netCents) - Math.abs(a.netCents) || a.name.localeCompare(b.name),
      );
      view.groups.push({ groupId: group.id, name: group.name, people });
    }
  }

  view.recentlySettled.sort((a, b) => (b.lastSettledAt ?? '').localeCompare(a.lastSettledAt ?? ''));
  return view;
}

/** The line under a person's name: a waiting claim first, otherwise who owes whom. */
export function statusLine(person: PersonBalance): string {
  const toMe = person.claimsToMe.reduce((sum, p) => sum + p.amountCents, 0);
  if (toMe > 0) return `Says they paid ${formatCents(toMe)} · tap to confirm`;
  const fromMe = person.claimsFromMe.reduce((sum, p) => sum + p.amountCents, 0);
  if (fromMe > 0) return `You said you paid ${formatCents(fromMe)} · waiting for ${person.name}`;
  if (person.netCents > 0) return 'Owes you';
  if (person.netCents < 0) return 'You owe';
  return 'Settled up';
}
