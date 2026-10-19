// get-share: what a private payment link shows. Only that person's items and shares on the
// requester's expenses, what they owe, and the requester's payment usernames. Never an
// expense's total, the requester's own items, or anyone else's (Rule 5; see link_share()).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const body = await readBody(req);
  if (!isToken(body?.token))
    return fail(404, 'This link doesn’t work. Check you copied all of it.');
  const tokenHash = await sha256Hex(body.token);

  const admin = adminClient();
  if (
    !(await withinLimit(admin, `share:ip:${clientIp(req)}`, 60, 60)) ||
    !(await withinLimit(admin, `share:link:${tokenHash}`, 30, 60))
  ) {
    return fail(429, TOO_MANY);
  }

  const { data, error } = await admin.rpc('link_share', { p_token_hash: tokenHash });
  if (error) return dbError(error);
  return json(data);
});
