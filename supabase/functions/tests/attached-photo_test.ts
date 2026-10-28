// A photo attached to an expense stays put: its uploader can't delete it through Storage, and
// extract-receipt won't read it again (an unreadable result would delete it). Signs in as the
// seed's Leo (npm run test:functions); never reaches a model, so it costs no API calls.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.13';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { requireEnv } from '../_shared/admin.ts';

const API_URL = requireEnv('API_URL');
const network = { sanitizeOps: false, sanitizeResources: false };

Deno.test('An attached photo can’t be deleted or scanned again', network, async () => {
  const admin = createClient(API_URL, requireEnv('SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const leo = createClient(API_URL, requireEnv('ANON_KEY'), { auth: { persistSession: false } });
  const { data, error } = await leo.auth.signInWithPassword({
    email: 'leo@example.com',
    password: 'password123',
  });
  if (error || !data.session) throw error ?? new Error('No session');
  const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const exists = async () => !(await admin.storage.from('receipts').download(path)).error;
  let expenseId: string | null = null;

  try {
    const upload = await leo.storage.from('receipts').upload(path, jpeg, {
      contentType: 'image/jpeg',
    });
    if (upload.error) throw upload.error;
    // Leo's own $5.00 expense in the seed's Apartment, with the photo attached.
    const saved = await leo.rpc('save_expense', {
      p_group_id: '22222222-2222-2222-2222-222222222222',
      p_paid_by: '33333333-3333-3333-3333-333333330001',
      p_merchant: 'Attached photo test',
      p_expense_date: new Date().toISOString().slice(0, 10),
      p_total_cents: 500,
      p_shares: [{ participant_id: '33333333-3333-3333-3333-333333330001', amount_cents: 500 }],
    });
    if (saved.error) throw saved.error;
    expenseId = saved.data as string;
    const attached = await leo.rpc('attach_receipt', { p_expense_id: expenseId, p_path: path });
    if (attached.error) throw attached.error;

    await leo.storage.from('receipts').remove([path]);
    assertEquals(await exists(), true, 'Leo deleted his attached photo');

    const response = await fetch(`${API_URL}/functions/v1/extract-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ path, session: crypto.randomUUID() }),
    });
    const body = (await response.json()) as { error?: string };
    // 503 when no receipt reader is set up locally, which is checked first.
    assert(
      (response.status === 409 &&
        body.error === 'That photo was already scanned. Take a new one.') ||
        response.status === 503,
      `got ${response.status}: ${body.error}`,
    );
    assertEquals(await exists(), true);
  } finally {
    if (expenseId) await leo.rpc('void_expense', { p_expense_id: expenseId });
    await leo.auth.signOut();
  }
});
