// scan-allowance says how many receipt scans are left this month (npm run test:functions).
// Signs in as the seed's Leo; never scans, so it costs no API calls.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const network = { sanitizeOps: false, sanitizeResources: false };

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

Deno.test('Leo sees his scans left and when they reset', network, async () => {
  const leo = createClient(API_URL, requireEnv('ANON_KEY'), { auth: { persistSession: false } });
  const { data, error } = await leo.auth.signInWithPassword({
    email: 'leo@example.com',
    password: 'password123',
  });
  if (error || !data.session) throw error ?? new Error('No session');
  try {
    const response = await allowance(data.session.access_token);
    assertEquals(response.status, 200);
    const body = (await response.json()) as {
      limit: number;
      used: number;
      left: number | null;
      resets_on: string;
    };
    // left is null only when no receipt reader is configured.
    if (body.left !== null) assertEquals(body.left, Math.max(body.limit - body.used, 0));
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    assertEquals(body.resets_on, next.toISOString().slice(0, 10));
    assert(body.limit >= 0);
  } finally {
    await leo.auth.signOut();
  }
});
