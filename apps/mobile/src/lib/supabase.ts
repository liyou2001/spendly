import type { Database } from '@spendly/db';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureSessionStorage } from './secureSessionStorage';

// EXPO_PUBLIC_* values are inlined into the bundle at build time, so they must be read with
// these exact property names. Both are public by design: the database's row-level security,
// not this key, is what protects data (Rule 9 keeps real secrets on the server).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to apps/mobile/.env, fill them in (see the README), then restart `npm run mobile`.',
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
