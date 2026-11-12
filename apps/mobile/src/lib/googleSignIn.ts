import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { GOOGLE_FAILED, readAuthRedirect } from './authRedirect';
import { supabase } from './supabase';

// Sign in with Google through the browser, so it works in Expo Go (Google's own SDK needs a
// custom build). Supabase links it to an existing account with the same email.

// Google asks which account every time, so it's clear which email is being used.
const queryParams = { prompt: 'select_account' };

/**
 * Starts Google sign-in. On the web the page goes to Google and comes back to sign-in, where
 * supabase-js reads the session from the URL. In the app, Google opens in a browser sheet that
 * returns to the app; the session listener then shows the app. Resolves with a message to show,
 * or null (signed in, cancelled, or the page is on its way to Google).
 */
export async function signInWithGoogle(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/sign-in`, queryParams },
    });
    return error ? GOOGLE_FAILED : null;
  }

  // exp://…/--/sign-in in Expo Go, spendly://sign-in in a build.
  const redirectTo = Linking.createURL('/sign-in');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams },
  });
  if (error || !data.url) return GOOGLE_FAILED;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null;

  const outcome = readAuthRedirect(result.url);
  if (!outcome) return GOOGLE_FAILED;
  if (outcome.kind === 'cancelled') return null;
  if (outcome.kind === 'error') return outcome.message;
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: outcome.accessToken,
    refresh_token: outcome.refreshToken,
  });
  return sessionError ? GOOGLE_FAILED : null;
}
