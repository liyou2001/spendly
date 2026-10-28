// scan-allowance: how many receipt scans you have left this month, for Add expense to show
// before you scan. Same limit and count as extract-receipt; signed in only.
import { adminClient } from '../_shared/admin.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { receiptReader } from '../_shared/reader.ts';
import { monthlyScanLimit } from '../_shared/receipt.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const admin = adminClient();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return fail(401, 'Sign in first.');

  // Months are counted in UTC, like receipt_scans_this_month(), so they also reset at 00:00 UTC.
  const now = new Date();
  const resetsOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  const limit = monthlyScanLimit(Deno.env.get('RECEIPT_SCANS_PER_MONTH'));
  // Without a reader there's nothing to count down; scanning says it isn't set up.
  if (!receiptReader()) return json({ limit, used: 0, left: null, resets_on: resetsOn });

  const { data: used, error } = await admin.rpc('receipt_scans_this_month', {
    p_user_id: auth.user.id,
  });
  if (error) return fail(500, 'Something went wrong. Try again.');
  return json({ limit, used, left: Math.max(limit - used, 0), resets_on: resetsOn });
});
