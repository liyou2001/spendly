// add-email: adding an address you forward receipts from. Emails it a 6-digit code, which you
// enter in the app (verify_email). Signed in only. Without POSTMARK_SERVER_TOKEN (local
// development) the code is printed in the functions log instead.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import { corsHeaders, dbError, fail, json, readBody, TOO_MANY } from '../_shared/http.ts';
import { sendEmail } from '../_shared/postmark.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const admin = adminClient();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return fail(401, 'Sign in first.');

  const body = await readBody(req);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return fail(400, 'Enter an email address.');
  if (!(await withinLimit(admin, `add-email:${auth.user.id}`, 5, 3600))) return fail(429, TOO_MANY);

  const { data: code, error } = await admin.rpc('email_code_create', {
    p_user_id: auth.user.id,
    p_email: email,
  });
  if (error) return dbError(error);

  const sent = await sendEmail({
    to: email,
    subject: `${code} is your Spendly code`,
    text: `Enter ${code} in Spendly to add this address for forwarding receipts. It expires in 15 minutes.\n\nIf you didn’t ask for this, you can ignore it.`,
  });
  if (!sent) console.log(`(not sent: no POSTMARK_SERVER_TOKEN) Spendly code for ${email}: ${code}`);
  return json({ sent });
});
