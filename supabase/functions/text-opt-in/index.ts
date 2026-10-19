// text-opt-in: the "Text me about payments" box on a payment link. The person types their own
// number, and the consent is saved with when and where it came from (Rule 8).
import { adminClient, withinLimit } from '../_shared/admin.ts';
import {
  clientIp,
  corsHeaders,
  dbError,
  fail,
  isToken,
  json,
  normalizePhone,
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
  if (typeof body.opt_in !== 'boolean') return fail(400, 'Say whether to text you.');
  let phone: string | null = null;
  if (body.opt_in) {
    phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null;
    if (!phone) return fail(400, 'Enter a US number, or start with + and the country code.');
  }
  const tokenHash = await sha256Hex(body.token);

  const admin = adminClient();
  if (
    !(await withinLimit(admin, `texts:ip:${clientIp(req)}`, 20, 3600)) ||
    !(await withinLimit(admin, `texts:link:${tokenHash}`, 5, 3600))
  ) {
    return fail(429, TOO_MANY);
  }

  const { error } = await admin.rpc('link_text_opt_in', {
    p_token_hash: tokenHash,
    p_opt_in: body.opt_in,
    ...(phone ? { p_phone: phone } : {}),
  });
  if (error) return dbError(error);
  return json({ opted_in: body.opt_in });
});
