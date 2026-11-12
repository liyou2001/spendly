// Reading the URL a Google sign-in comes back to. Pure, so it's unit tested.

export const GOOGLE_FAILED = 'Couldn’t sign in with Google. Try again, or use an email code.';

export type RedirectOutcome =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  /** Something to show the person. */
  | { kind: 'error'; message: string }
  /** They backed out on Google's page: nothing to show. */
  | { kind: 'cancelled' };

/** The query and hash parameters of a URL, decoded. Later ones (the hash) win. */
function params(url: string): Map<string, string> {
  const found = new Map<string, string>();
  const [beforeHash = '', hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [key = '', value = ''] = pair.split('=');
      const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
      found.set(decode(key), decode(value));
    }
  }
  return found;
}

/**
 * What a sign-in redirect says: the session (in the hash: #access_token=…&refresh_token=…), an
 * error, or that they cancelled. null when the URL is an ordinary one with neither.
 */
export function readAuthRedirect(url: string): RedirectOutcome | null {
  const p = params(url);
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };

  const error = p.get('error');
  const description = p.get('error_description');
  if (!error && !description) return null;
  if (error === 'access_denied') return { kind: 'cancelled' };
  // Our own refusals (the sign-up hook) are written for people; Supabase's and Google's aren't.
  if (description?.includes('Spendly')) return { kind: 'error', message: description };
  return { kind: 'error', message: GOOGLE_FAILED };
}
