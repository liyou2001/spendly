// What a username field shows as you type: checked as you go, looked up after a pause.
import type { FoundUser } from './data';
import { validateUsername } from './profile';

export type UsernameCheck =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | { status: 'checking' }
  | { status: 'found'; user: FoundUser }
  | { status: 'notFound' }
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'error' };

/** "find": look up someone to invite. "available": check a username you want for yourself. */
export type UsernameCheckMode = 'find' | 'available';

/**
 * The state to show for what's typed, and the username to look up (null when no lookup is
 * needed). `result` is the latest lookup, for whichever username it was made.
 */
export function usernameCheckFor(
  text: string,
  mode: UsernameCheckMode,
  ownUsername: string | null,
  result: { username: string; check: UsernameCheck } | null,
): { check: UsernameCheck; lookup: string | null } {
  const parsed = validateUsername(text);
  if (!parsed.ok) {
    return {
      check: parsed.error ? { status: 'invalid', message: parsed.error } : { status: 'empty' },
      lookup: null,
    };
  }
  if (mode === 'available' && parsed.username === ownUsername) {
    return { check: { status: 'available' }, lookup: null };
  }
  return {
    check: result?.username === parsed.username ? result.check : { status: 'checking' },
    lookup: parsed.username,
  };
}
