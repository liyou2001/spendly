// End-to-end: Jeff's link, through the get-share Edge Function, against local Supabase with
// the seed data (npm run test:functions). The response must never contain Maya's items, Leo's
// own items or the $140 total.
import { assertEquals, assertFalse } from 'jsr:@std/assert@1.0.13';
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

async function getShare(token: string) {
  const response = await fetch(`${API_URL}/functions/v1/get-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return { status: response.status, text: await response.text() };
}

Deno.test(
  'Jeff’s link shows only his 3 shared items and $15.00, until Leo revokes it',
  network,
  async () => {
    const token = crypto.randomUUID().replaceAll('-', '');
    const { data: link, error } = await admin
      .from('share_links')
      .insert({ participant_id: JEFF, requested_by: LEO, token_hash: await sha256Hex(token) })
      .select('id')
      .single();
    if (error) throw error;

    try {
      const { status, text } = await getShare(token);
      assertEquals(status, 200);
      const page = JSON.parse(text);
      assertEquals(page.person_name, 'Jeff');
      assertEquals(page.payer_name, 'Leo');
      const costco = page.expenses.find((e: { merchant: string }) => e.merchant === 'Costco');
      assertEquals(costco.amount_cents, 1500);
      assertEquals(
        costco.items.map((i: { name: string }) => i.name),
        ['Paper towels', 'Dish soap', 'Trash bags'],
      );
      for (const secret of [
        'Protein powder',
        'Graphic tee',
        'Oat milk',
        'Hummus',
        'Maya',
        '14000',
      ]) {
        assertFalse(text.includes(secret), `response mentions ${secret}`);
      }

      await admin
        .from('share_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', link.id);
      assertEquals((await getShare(token)).status, 404);
    } finally {
      await admin.from('share_links').delete().eq('id', link.id);
    }
  },
);

Deno.test('A made-up token gets nothing', network, async () => {
  const { status, text } = await getShare('a'.repeat(32));
  assertEquals(status, 404);
  assertFalse(text.includes('Costco'));
});
