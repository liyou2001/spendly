// scan-allowance says how many receipt scans are left this month (npm run test:functions).
// Signs in as the seed's Leo; never scans, so it costs no API calls. The count is checked
// against scan records the test adds itself.
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const network = { sanitizeOps: false, sanitizeResources: false };

interface Allowance {
  limit: number;
  used: number;
  left: number | null;
  resets_on: string;
}

const allowance = (token?: string) =>
  fetch(`${API_URL}/functions/v1/scan-allowance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? requireEnv('ANON_KEY')}`,
    },
    body: '{}',
  });

Deno.test('Signed out, there is no allowance to show', network, async () => {
  const response = await allowance();
  await response.body?.cancel();
  assertEquals(response.status, 401);
});

Deno.test('Every scan this month counts, and failed ones don’t', network, async () => {
  const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const leo = createClient(API_URL, requireEnv('ANON_KEY'), { auth: { persistSession: false } });
  const { data, error } = await leo.auth.signInWithPassword({
    email: 'leo@example.com',
    password: 'password123',
  });
  if (error || !data.session) throw error ?? new Error('No session');
  const read = async (): Promise<Allowance> => {
    const response = await allowance(data.session.access_token);
    assertEquals(response.status, 200);
    return (await response.json()) as Allowance;
  };
  const paths = [1, 2, 3].map(() => `${data.user.id}/${crypto.randomUUID()}.jpg`);

  try {
    const before = await read();
    // Two scans that count (read, or read but not adding up) and one that failed on our side.
    const { error: insertError } = await admin.from('receipt_extractions').insert([
      { user_id: data.user.id, source: 'photo', storage_path: paths[0], status: 'succeeded' },
      { user_id: data.user.id, source: 'photo', storage_path: paths[1], status: 'mismatch' },
      { user_id: data.user.id, source: 'photo', storage_path: paths[2], status: 'failed' },
    ]);
    if (insertError) throw insertError;
    const after = await read();

    assertEquals(after.used - before.used, 2);
    if (before.left !== null && after.left !== null) {
      assertEquals(after.left, Math.max(after.limit - after.used, 0));
      assertEquals(before.left - after.left, Math.min(2, before.left));
    }
    // The 1st of a month after today.
    assertMatch(after.resets_on, /^\d{4}-\d{2}-01$/);
    assert(after.resets_on > new Date().toISOString().slice(0, 10));
  } finally {
    await admin.from('receipt_extractions').delete().in('storage_path', paths);
    await leo.auth.signOut();
  }
});
