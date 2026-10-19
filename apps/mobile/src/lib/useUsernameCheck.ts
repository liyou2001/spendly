import { useEffect, useState } from 'react';

import { findUser, usernameAvailable } from './data';
import { usernameCheckFor, type UsernameCheck, type UsernameCheckMode } from './usernameCheck';

/** How long typing has to pause before the username is looked up. */
const PAUSE_MS = 400;

/** Checks a username as it's typed: format right away, then a lookup once typing pauses. */
export function useUsernameCheck(
  text: string,
  mode: UsernameCheckMode,
  ownUsername: string | null = null,
): UsernameCheck {
  const [result, setResult] = useState<{ username: string; check: UsernameCheck } | null>(null);
  const { check, lookup } = usernameCheckFor(text, mode, ownUsername, result);

  useEffect(() => {
    if (!lookup) return;
    let current = true;
    const timer = setTimeout(() => {
      const run: Promise<UsernameCheck> =
        mode === 'find'
          ? findUser(lookup).then((user) =>
              user ? { status: 'found', user } : { status: 'notFound' },
            )
          : usernameAvailable(lookup).then((free) => ({ status: free ? 'available' : 'taken' }));
      run.then(
        (next) => current && setResult({ username: lookup, check: next }),
        () => current && setResult({ username: lookup, check: { status: 'error' } }),
      );
    }, PAUSE_MS);
    // Typing again cancels the lookup for the old text.
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [lookup, mode]);

  return check;
}
