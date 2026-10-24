// sms-inbound: texts people send back. Replying STOP (or a way of saying it) withdraws their
// consent, so sendText() never texts them again (Rule 8). Twilio or Telnyx calls this, per
// SMS_PROVIDER, and every call must carry the provider's signature. The provider itself
// answers STOP with its confirmation, so nothing is sent from here.
import { adminClient } from '../_shared/admin.ts';
import { fail, json, normalizePhone } from '../_shared/http.ts';
import { isStop, telnyxSignatureValid, twilioSignatureValid } from '../_shared/sms_webhook.ts';

/** Who texted and what they said, if the provider's signature checks out. */
async function readText(req: Request): Promise<{ from: string; text: string } | null | 'ignore'> {
  const provider = Deno.env.get('SMS_PROVIDER');
  const body = await req.text();
  if (provider === 'twilio') {
    const token = Deno.env.get('TWILIO_AUTH_TOKEN');
    // The exact URL configured in Twilio, which is what it signs.
    const url = Deno.env.get('SMS_WEBHOOK_URL');
    const params = new URLSearchParams(body);
    const signature = req.headers.get('X-Twilio-Signature') ?? '';
    if (!token || !url || !(await twilioSignatureValid(token, url, params, signature))) return null;
    return { from: params.get('From') ?? '', text: params.get('Body') ?? '' };
  }
  if (provider === 'telnyx') {
    const key = Deno.env.get('TELNYX_PUBLIC_KEY');
    const signature = req.headers.get('telnyx-signature-ed25519') ?? '';
    const timestamp = req.headers.get('telnyx-timestamp') ?? '';
    if (!key || !(await telnyxSignatureValid(key, timestamp, body, signature))) return null;
    const event = JSON.parse(body) as {
      data?: { event_type?: string; payload?: { from?: { phone_number?: string }; text?: string } };
    };
    // Telnyx also reports delivery of what we sent; only replies matter here.
    if (event.data?.event_type !== 'message.received') return 'ignore';
    return {
      from: event.data.payload?.from?.phone_number ?? '',
      text: event.data.payload?.text ?? '',
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');
  let reply: Awaited<ReturnType<typeof readText>>;
  try {
    reply = await readText(req);
  } catch {
    return fail(400, 'Not a text');
  }
  if (reply === null) return fail(401, 'Unauthorized');

  if (reply !== 'ignore' && isStop(reply.text)) {
    const phone = normalizePhone(reply.from);
    if (phone) {
      const { error } = await adminClient()
        .from('sms_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('phone', phone)
        .is('revoked_at', null);
      // Twilio and Telnyx retry on an error, so a failed save gets another try.
      if (error) {
        console.error('Couldn’t save a STOP', error);
        return fail(500, 'Try again');
      }
    }
  }

  // Twilio expects TwiML; an empty response sends no reply.
  return Deno.env.get('SMS_PROVIDER') === 'twilio'
    ? new Response('<Response/>', { headers: { 'Content-Type': 'text/xml' } })
    : json({ ok: true });
});
