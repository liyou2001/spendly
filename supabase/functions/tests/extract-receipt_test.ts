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

Deno.test('You can delete your own receipt photo, and no one else’s', network, async () => {
  const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const leo = createClient(API_URL, requireEnv('ANON_KEY'), { auth: { persistSession: false } });
  const { data, error } = await leo.auth.signInWithPassword({
    email: 'leo@example.com',
    password: 'password123',
  });
  if (error || !data.user) throw error ?? new Error('No session');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const own = `${data.user.id}/${crypto.randomUUID()}.jpg`;
  const others = `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;
  const exists = async (path: string) =>
    !(await admin.storage.from('receipts').download(path)).error;

  try {
    await leo.storage.from('receipts').upload(own, jpeg, { contentType: 'image/jpeg' });
    await admin.storage.from('receipts').upload(others, jpeg, { contentType: 'image/jpeg' });

    await leo.storage.from('receipts').remove([own, others]);
    assertEquals(await exists(own), false);
    assertEquals(await exists(others), true);
  } finally {
    await admin.storage.from('receipts').remove([own, others]);
    await leo.auth.signOut();
  }
});
