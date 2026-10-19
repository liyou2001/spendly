// notify-claim: the app calls this right after "I paid" so the person paid gets a push. Signed
// in only, and only for a claim the caller made in the last few minutes.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import { corsHeaders, fail, formatUsd, isUuid, json, readBody, TOO_MANY } from '../_shared/http.ts';
import { claimMessage, pushToUser } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const admin = adminClient();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return fail(401, 'Sign in first.');

  const body = await readBody(req);
  const paymentId = body?.payment_id;
  if (!isUuid(paymentId)) return fail(400, 'Which payment?');
  if (!(await withinLimit(admin, `notify:user:${auth.user.id}`, 30, 3600))) {
    return fail(429, TOO_MANY);
  }

  const { data, error } = await admin.rpc('claim_notice', {
    p_payment_id: paymentId,
    p_user_id: auth.user.id,
  });
  if (error || !data) return fail(404, 'No recent claim to notify about.');
  // One push per claim, counted only once it's known to be the caller's.
  if (!(await withinLimit(admin, `notify:payment:${paymentId}`, 1, 86400))) {
    return fail(429, TOO_MANY);
  }

  const notice = data as {
    notify_user_id: string | null;
    person_name: string;
    person_id: string;
    amount_cents: number;
  };
  // The recipient opens the claimer from their own side of the group, which is the same
  // participant id.
  await pushToUser(
    admin,
    notice.notify_user_id,
    claimMessage(notice.person_name, formatUsd(notice.amount_cents), notice.person_id),
  );
  return json({ ok: true });
});
