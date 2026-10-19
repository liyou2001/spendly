// postmark-inbound against local Supabase (npm run test:functions). Never reaches a model: it
// checks the shared secret, and that an email from an unknown sender is recorded as such.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const secret = Deno.env.get('POSTMARK_INBOUND_SECRET');
const network = { sanitizeOps: false, sanitizeResources: false };

const post = (body: unknown, password: string) =>
  fetch(`${API_URL}/functions/v1/postmark-inbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`postmark:${password}`)}`,
    },
    body: JSON.stringify(body),
  });

Deno.test('Only Postmark, with the shared secret, can post emails', network, async () => {
  const response = await post({ MessageID: 'x', From: 'a@b.co' }, 'wrong-secret');
  await response.body?.cancel();
  // 503 when the functions have no POSTMARK_INBOUND_SECRET set.
  assert([401, 503].includes(response.status), `got ${response.status}`);
});

Deno.test({
  name: 'An email from an unknown sender is recorded, not read',
  ignore: !secret,
  ...network,
  fn: async () => {
    const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const id = `test-${crypto.randomUUID()}`;
    try {
      const response = await post(
        {
          MessageID: id,
          From: 'Stranger <stranger@example.net>',
          FromFull: { Email: 'stranger@example.net' },
          Subject: 'Fwd: order',
          TextBody: 'Order total $10.00',
          Headers: [
            { Name: 'Received-SPF', Value: 'Pass envelope-from=stranger@example.net' },
            { Name: 'Auto-Submitted', Value: 'auto-generated' },
          ],
        },
        secret ?? '',
      );
      assertEquals(response.status, 200);
      await response.body?.cancel();
      let status = '';
      for (let i = 0; i < 20 && status !== 'unknown_sender'; i++) {
        const { data } = await admin
          .from('inbound_emails')
          .select('status')
          .eq('provider_message_id', id)
          .single();
        status = data?.status ?? '';
        if (status !== 'unknown_sender') await new Promise((r) => setTimeout(r, 250));
      }
      assertEquals(status, 'unknown_sender');
    } finally {
      await admin.from('inbound_emails').delete().eq('provider_message_id', id);
    }
  },
});
