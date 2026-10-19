// inbound-email against local Supabase (npm run test:functions). Never reaches a model: it
// checks the shared secret, and that an email from an unknown sender is recorded as such and
// answered (in Mailpit).
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const MAILPIT_URL = Deno.env.get('MAILPIT_HOST_URL') ?? 'http://127.0.0.1:54324';
const secret = Deno.env.get('INBOUND_SECRET');
const network = { sanitizeOps: false, sanitizeResources: false };

const post = (raw: string, headers: Record<string, string>) =>
  fetch(`${API_URL}/functions/v1/inbound-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'message/rfc822', ...headers },
    body: raw,
  });

const rawEmail = (from: string, extra: string[] = []) =>
  [
    `From: Stranger <${from}>`,
    'To: receipts@spendly.local',
    'Subject: Fwd: order',
    `Message-ID: <${crypto.randomUUID()}@example.net>`,
    ...extra,
    '',
    'Order total $10.00',
  ].join('\r\n');

async function waitFor<T>(check: () => Promise<T | null>): Promise<T | null> {
  for (let i = 0; i < 40; i++) {
    const found = await check();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

Deno.test('Only the Worker, with the shared secret, can post emails', network, async () => {
  const response = await post(rawEmail('a@example.net'), { 'X-Inbound-Secret': 'wrong-secret' });
  await response.body?.cancel();
  // 503 when the functions have no INBOUND_SECRET set.
  assert([401, 503].includes(response.status), `got ${response.status}`);
});

Deno.test({
  name: 'An email from an unknown sender is recorded, not read, and gets one reply',
  ignore: !secret,
  ...network,
  fn: async () => {
    const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const from = `stranger-${crypto.randomUUID().slice(0, 8)}@example.net`;
    try {
      const response = await post(rawEmail(from), {
        'X-Inbound-Secret': secret ?? '',
        'X-Envelope-From': from,
        'X-Test-Sender': from,
      });
      assertEquals(response.status, 200);
      await response.body?.cancel();

      const status = await waitFor(async () => {
        const { data } = await admin
          .from('inbound_emails')
          .select('status')
          .eq('from_address', from)
          .maybeSingle();
        return data?.status === 'unknown_sender' ? data.status : null;
      });
      assertEquals(status, 'unknown_sender');

      const reply = await waitFor(async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${from}`)}`,
        );
        const body = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
        return body.messages?.[0] ?? null;
      });
      assertEquals(reply?.Subject, 'Re: Fwd: order');
      if (reply) {
        await fetch(`${MAILPIT_URL}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: [reply.ID] }),
        }).then((r) => r.body?.cancel());
      }
    } finally {
      await admin.from('inbound_emails').delete().eq('from_address', from);
    }
  },
});
