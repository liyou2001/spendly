// One-off groups, shown to people as "quick splits": a group for a single outing, made from
// Add expense and kept out of group lists. (The database calls them one-offs: groups.is_one_off.)
import { monthDay } from './dates';
import { joinNames } from './labels';

/** A quick split's name, from who was there and when: "Jeff · Oct 19", "Jeff and Maya · Oct 19",
 * "Jeff, Maya and 2 others · Oct 19". */
export function oneOffName(otherNames: readonly string[], date: string): string {
  const who =
    otherNames.length <= 3
      ? joinNames(otherNames)
      : `${otherNames.slice(0, 2).join(', ')} and ${otherNames.length - 2} others`;
  return `${who} · ${monthDay(date)}`;
}

export interface KnownPerson {
  displayName: string;
  phone: string | null;
  /** When they were added to a group; the newest copy of a person wins. */
  addedAt: string;
  /** Set when they have an account, so picking them can invite that account. */
  userId?: string | null;
  username?: string | null;
}

/**
 * People you've split with before, once each, most recently added first. The same person is
 * a separate participant in every group, so copies are merged by account, then by phone
 * number, then by name (ignoring case).
 */
export function dedupePeople(people: readonly KnownPerson[]): KnownPerson[] {
  const newestFirst = [...people].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const seen = new Set<string>();
  const unique: KnownPerson[] = [];
  for (const person of newestFirst) {
    const key =
      (person.userId ? `user:${person.userId}` : null) ??
      person.phone ??
      `name:${person.displayName.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(person);
  }
  return unique;
}
