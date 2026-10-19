// extract-receipt only reads photos in your own folder (npm run test:functions). Signs in as the
// seed's Leo. It never gets as far as a model, so it costs no API calls: someone else's photo is
// refused, and a missing one of his own stops at "Couldn't find that photo" (or at "isn't set up"
// when no API key is set).
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const network = { sanitizeOps: false, sanitizeResources: false };

Deno.test('Only your own uploaded photo can be scanned', network, async () => {
  const leo = createClient(API_URL, requireEnv('ANON_KEY'), { auth: { persistSession: false } });
  const { data, error } = await leo.auth.signInWithPassword({
    email: 'leo@example.com',
    password: 'password123',
  });
  if (error || !data.user) throw error ?? new Error('No session');

  try {
    const scan = async (path: string) => {
      const response = await fetch(`${API_URL}/functions/v1/extract-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ path }),
      });
      return {
        status: response.status,
        error: ((await response.json()) as { error?: string }).error,
      };
    };

    assertEquals(await scan(`${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`), {
      status: 400,
      error: 'Which photo?',
    });
    assertEquals((await scan(`${data.user.id}/../other.jpg`)).status, 400);

    const missing = await scan(`${data.user.id}/${crypto.randomUUID()}.jpg`);
    assert(
      (missing.status === 404 && missing.error === 'Couldn’t find that photo. Try again.') ||
        (missing.status === 503 && missing.error?.startsWith('Receipt scanning isn’t set up')),
      `got ${missing.status}: ${missing.error}`,
    );
  } finally {
    await leo.auth.signOut();
  }
});
