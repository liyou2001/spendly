// claim-payment: "I paid Leo" from a payment link. Creates a claim the requester confirms in
// the app, and lets them know with a push.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import {
  clientIp,
  corsHeaders,
  dbError,
  fail,
  formatUsd,
  isToken,
  json,
  readBody,
  sha256Hex,
  TOO_MANY,
} from '../_shared/http.ts';
import { claimMessage, pushToUser } from '../_shared/push.ts';

const METHODS = ['venmo', 'paypal', 'cashapp', 'zelle', 'cash', 'other'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const body = await readBody(req);
  if (!isToken(body?.token))
    return fail(404, 'This link doesn’t work. Check you copied all of it.');
  const amount = body.amount_cents;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    return fail(400, 'Enter how much you paid.');
  }
  const method = body.method ?? null;
  if (method !== null && !METHODS.includes(method as string))
    return fail(400, 'Unknown payment method.');
  const tokenHash = await sha256Hex(body.token);

  const admin = adminClient();
  if (
    !(await withinLimit(admin, `claim:ip:${clientIp(req)}`, 20, 3600)) ||
    !(await withinLimit(admin, `claim:link:${tokenHash}`, 5, 3600))
  ) {
    return fail(429, TOO_MANY);
  }

  const { data, error } = await admin.rpc('link_claim', {
    p_token_hash: tokenHash,
    p_amount_cents: amount,
    ...(method ? { p_method: method as string } : {}),
  });
  if (error) return dbError(error);

  const claim = data as { notify_user_id: string | null; person_name: string; person_id: string };
  await pushToUser(
    admin,
    claim.notify_user_id,
    claimMessage(claim.person_name, formatUsd(amount), claim.person_id),
  );
  return json({ ok: true });
});
