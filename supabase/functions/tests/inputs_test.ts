// The payment page functions refuse bad input before anything is saved (npm run test:functions).
// None of these requests creates a payment, note or consent.
import { assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';
import { sha256Hex } from '../_shared/http.ts';

const API_URL = requireEnv('API_URL');
const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const LEO = '33333333-3333-3333-3333-333333330001';
const JEFF = '33333333-3333-3333-3333-333333330002';
// supabase-js keeps timers of its own, which Deno's leak checks would flag.
const network = { sanitizeOps: false, sanitizeResources: false };

async function call(name: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${API_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, error: ((await response.json()) as { error?: string }).error };
}

Deno.test('Bad input from the payment page is refused with a message', network, async () => {
  const token = crypto.randomUUID().replaceAll('-', '');
  const { data: link, error } = await admin
    .from('share_links')
    .insert({ participant_id: JEFF, requested_by: LEO, token_hash: await sha256Hex(token) })
    .select('id')
    .single();
  if (error) throw error;

  try {
    assertEquals(await call('claim-payment', { token, amount_cents: -5 }), {
      status: 400,
      error: 'Enter how much you paid.',
    });
    assertEquals(await call('claim-payment', { token, amount_cents: 12.5 }), {
      status: 400,
      error: 'Enter how much you paid.',
    });
    assertEquals(await call('claim-payment', { token, amount_cents: 500, method: 'bitcoin' }), {
      status: 400,
      error: 'Unknown payment method.',
    });
    const tooMuch = await call('claim-payment', { token, amount_cents: 999999 });
    assertEquals(tooMuch.status, 400);
    assertEquals(tooMuch.error?.startsWith('That’s more than you owe'), true);

    assertEquals(await call('flag-problem', { token, message: '   ' }), {
      status: 400,
      error: 'Say what looks wrong.',
    });
    assertEquals((await call('flag-problem', { token, message: 'x'.repeat(501) })).status, 400);

    assertEquals(await call('text-opt-in', { token, opt_in: true, phone: '555-0123' }), {
      status: 400,
      error: 'Enter a US number, or start with + and the country code.',
    });
    assertEquals((await call('text-opt-in', { token, opt_in: 'yes' })).status, 400);
  } finally {
    await admin.from('share_links').delete().eq('id', link.id);
  }
});

Deno.test('notify-claim needs a signed-in caller', network, async () => {
  const { status } = await call(
    'notify-claim',
    { payment_id: crypto.randomUUID() },
    { Authorization: `Bearer ${requireEnv('ANON_KEY')}` },
  );
  assertEquals(status, 401);
});
