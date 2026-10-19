// flag-problem: "Something looks wrong" from a payment link. Sends the requester a note, shown
// in their app until they dismiss it, and a push.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import {
  clientIp,
  corsHeaders,
  dbError,
  fail,
  isToken,
  json,
  readBody,
  sha256Hex,
  TOO_MANY,
} from '../_shared/http.ts';
import { pushToUser } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const body = await readBody(req);
  if (!isToken(body?.token))
    return fail(404, 'This link doesn’t work. Check you copied all of it.');
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length === 0) return fail(400, 'Say what looks wrong.');
  if (message.length > 500) return fail(400, 'Keep it under 500 characters.');
  const tokenHash = await sha256Hex(body.token);

  const admin = adminClient();
  if (
    !(await withinLimit(admin, `flag:ip:${clientIp(req)}`, 20, 3600)) ||
    !(await withinLimit(admin, `flag:link:${tokenHash}`, 5, 3600))
  ) {
    return fail(429, TOO_MANY);
  }

  const { data, error } = await admin.rpc('link_flag', {
    p_token_hash: tokenHash,
    p_message: message,
  });
  if (error) return dbError(error);

  const note = data as { notify_user_id: string | null; person_name: string; person_id: string };
  await pushToUser(admin, note.notify_user_id, {
    title: `${note.person_name} says something looks wrong`,
    body: message.length > 140 ? `${message.slice(0, 139)}…` : message,
    url: `/people/${note.person_id}`,
  });
  return json({ ok: true });
});
