// clean-receipts only runs for pg_cron's shared secret, and never deletes a photo uploaded in
// the last day (npm run test:functions). Which photos count as unattached is tested in
// supabase/tests/21_receipt_photos_test.sql, since only SQL can backdate an upload.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const network = { sanitizeOps: false, sanitizeResources: false };

const clean = (secret: string) =>
  fetch(`${API_URL}/functions/v1/clean-receipts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': secret },
    body: '{}',
  });

Deno.test('Only pg_cron can clean up photos', network, async () => {
  const response = await clean('not the secret');
  await response.body?.cancel();
  // 503 when the functions have no CRON_SECRET at all.
  assert([401, 503].includes(response.status), `got ${response.status}`);
});

Deno.test({
  name: 'A photo from today is kept, attached or not',
  ...network,
  ignore: !CRON_SECRET,
  fn: async () => {
    const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    try {
      await admin.storage.from('receipts').upload(path, jpeg, { contentType: 'image/jpeg' });
      const response = await clean(CRON_SECRET ?? '');
      assertEquals(response.status, 200);
      await response.json();
      assertEquals((await admin.storage.from('receipts').download(path)).error, null);
    } finally {
      await admin.storage.from('receipts').remove([path]);
    }
  },
});
