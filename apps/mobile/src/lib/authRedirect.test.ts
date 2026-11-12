import { describe, expect, it } from 'vitest';

import { GOOGLE_FAILED, readAuthRedirect } from './authRedirect';

describe('readAuthRedirect', () => {
  it('reads the session from the hash, in the app or on the web', () => {
    expect(
      readAuthRedirect(
        'exp://192.168.1.5:8081/--/sign-in#access_token=a.b.c&refresh_token=r1&expires_in=3600',
      ),
    ).toEqual({ kind: 'session', accessToken: 'a.b.c', refreshToken: 'r1' });
    expect(
      readAuthRedirect('https://app.getspendly.app/sign-in#access_token=x&refresh_token=y'),
    ).toEqual({ kind: 'session', accessToken: 'x', refreshToken: 'y' });
  });

  it('shows our own refusal, decoded', () => {
    expect(
      readAuthRedirect(
        'spendly://sign-in?error=server_error&error_description=This+email+is+already+added+to+another+Spendly+account%2E',
      ),
    ).toEqual({
      kind: 'error',
      message: 'This email is already added to another Spendly account.',
    });
  });

  it('keeps other errors vague, and backing out quiet', () => {
    expect(
      readAuthRedirect(
        'spendly://sign-in#error=server_error&error_description=Unable+to+exchange+external+code',
      ),
    ).toEqual({ kind: 'error', message: GOOGLE_FAILED });
    expect(readAuthRedirect('spendly://sign-in?error=access_denied')).toEqual({
      kind: 'cancelled',
    });
  });

  it('ignores an ordinary URL', () => {
    expect(readAuthRedirect('https://app.getspendly.app/sign-in')).toBeNull();
  });
});
