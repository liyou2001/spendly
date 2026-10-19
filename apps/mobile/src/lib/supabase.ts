import type { Database } from '@spendly/db';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { localSupabaseUrl } from './devHost';
import { secureSessionStorage } from './secureSessionStorage';

/** Local Supabase's API port (supabase/config.toml, [api] port). */
const LOCAL_SUPABASE_PORT = 54321;

/**
 * The Supabase URL: EXPO_PUBLIC_SUPABASE_URL if it's set (hosted projects). Left blank, the app
 * uses local Supabase on the computer running the dev server, at the same address the phone
 * used to load the app, so it keeps working when that computer's Wi-Fi address changes.
 */
function supabaseUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (configured) return configured;
  return localSupabaseUrl(Constants.expoConfig?.hostUri, LOCAL_SUPABASE_PORT);
}

// EXPO_PUBLIC_* values are inlined into the bundle at build time, so they must be read with
// these exact property names. Both are public by design: the database's row-level security,
// not this key, is what protects data (Rule 9 keeps real secrets on the server).
const url = supabaseUrl();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing the Supabase URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to apps/mobile/.env, fill them in (see the README), then restart `npm run mobile`. ' +
      'With --tunnel, local Supabase isn’t reachable: set EXPO_PUBLIC_SUPABASE_URL to a hosted project.',
  );
}

const isWeb = Platform.OS === 'web';

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // SecureStore doesn't exist on web; there supabase-js falls back to localStorage.
    ...(isWeb ? {} : { storage: secureSessionStorage }),
    persistSession: true,
    autoRefreshToken: true,
    // Sign-in uses a code typed into the app, never a link that opens it.
    detectSessionInUrl: false,
  },
});

// supabase-js can't tell when a phone app goes to the background, so only refresh the session
// while the app is in front. On return it refreshes straight away if the token has expired.
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
