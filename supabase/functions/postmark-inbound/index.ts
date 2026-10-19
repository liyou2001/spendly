// postmark-inbound: forwarded receipts. Everyone forwards to one shared address; the sender's
// verified address says whose it is. Postmark calls this with a shared secret (basic auth in
// the webhook URL). It answers straight away and reads the email in the background. The email
// itself is never stored: only who sent it and what became of it (inbound_emails).
import { adminClient, withinLimit, type AdminClient } from '../_shared/admin.ts';
import { fail, json, readBody } from '../_shared/http.ts';
import { isAutomated, parseInbound, type InboundEmail } from '../_shared/inbound.ts';
import { sendEmail } from '../_shared/postmark.ts';
import { pushToUser } from '../_shared/push.ts';
import { receiptReader } from '../_shared/reader.ts';
import { monthlyScanLimit } from '../_shared/receipt.ts';

import { processEmail, type InboundDeps } from './process.ts';

/** Whether the request carries the shared secret as its basic auth password. */
function authorized(req: Request, secret: string): boolean {
  const match = /^Basic\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!match?.[1]) return false;
  let password = '';
  try {
    password = atob(match[1]).split(':').slice(1).join(':');
  } catch {
    return false;
  }
  // Compare without stopping at the first difference.
  let diff = password.length ^ secret.length;
  for (let i = 0; i < Math.max(password.length, secret.length); i++) {
    diff |= (password.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');
  const secret = Deno.env.get('POSTMARK_INBOUND_SECRET');
  if (!secret) {
    console.error('POSTMARK_INBOUND_SECRET is not set');
    return fail(503, 'Not set up');
  }
  if (!authorized(req, secret)) return fail(401, 'Unauthorized');

  const email = parseInbound(await readBody(req));
  if (!email) return fail(400, 'Not an inbound email');

  const admin = adminClient();
  const { data: row, error } = await admin
    .from('inbound_emails')
    .insert({
      provider_message_id: email.MessageID,
      from_address: (email.FromFull?.Email ?? email.From).slice(0, 320),
      subject: email.Subject?.slice(0, 300) ?? null,
      status: 'received',
    })
    .select('id')
    .single();
  // Postmark retries; the same message id is only read once.
  if (error?.code === '23505') return json({ ok: true, duplicate: true });
  if (error || !row) {
    console.error(error);
    return fail(500, 'Couldn’t save it');
  }

  const work = processEmail(email, liveDeps(admin, row.id));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  if (runtime) runtime.waitUntil(work);
  else await work;
  return json({ ok: true });
});

/** The real database, model, pushes and replies for processEmail. */
function liveDeps(admin: AdminClient, inboundId: string): InboundDeps {
  return {
    update: async (fields) => {
      const { error } = await admin.from('inbound_emails').update(fields).eq('id', inboundId);
      if (error) console.error('Couldn’t update the inbound email', error);
    },
    findUser: async (addresses) => {
      if (addresses.length === 0) return null;
      const { data } = await admin.rpc('inbound_find_user', { p_addresses: addresses });
      return (data as string | null) ?? null;
    },
    saveForwardingCode: async (userId, code) => {
      await admin.from('forwarding_codes').insert({ user_id: userId, code });
    },
    scansThisMonth: async (userId) => {
      const { data } = await admin.rpc('receipt_scans_this_month', { p_user_id: userId });
      return data ?? 0;
    },
    categories: async (userId) => {
      const { data } = await admin.from('categories').select('name').eq('user_id', userId);
      return (data ?? []).map((c) => c.name as string);
    },
    recordAttempt: async (userId, attempt) => {
      await admin.from('receipt_extractions').insert({
        user_id: userId,
        source: 'email',
        // One email is one scan toward the monthly limit, whichever models tried it.
        storage_path: `email:${inboundId}`,
        model: attempt.model,
        status: attempt.status,
        result: attempt.result,
        error: attempt.error,
      });
    },
    isDuplicate: async (userId, receipt) => {
      const { data } = await admin.rpc('inbound_is_duplicate', {
        p_user_id: userId,
        p_merchant: receipt.merchant ?? '',
        p_total_cents: receipt.total_cents,
        ...(receipt.date ? { p_date: receipt.date } : {}),
      });
      return data === true;
    },
    saveDraft: async (userId, outcome) => {
      const { data, error } = await admin
        .from('receipt_drafts')
        .insert({
          user_id: userId,
          inbound_email_id: inboundId,
          status: outcome.status,
          receipt: outcome.receipt,
          gap_cents: outcome.status === 'mismatch' ? outcome.gap_cents : 0,
        })
        .select('id')
        .single();
      if (error || !data) throw error ?? new Error('No draft');
      return data.id;
    },
    push: (userId, message) => pushToUser(admin, userId, message),
    replyToUnknownSender: (email) => replyToUnknownSender(admin, email),
    reader: receiptReader(),
    monthlyLimit: monthlyScanLimit(Deno.env.get('RECEIPT_SCANS_PER_MONTH')),
    receiptsAddress: Deno.env.get('RECEIPTS_EMAIL_ADDRESS'),
  };
}

/** Tells a sender we don't know how to forward from an address on their account. */
async function replyToUnknownSender(admin: AdminClient, email: InboundEmail) {
  const to = (email.FromFull?.Email ?? email.From).toLowerCase();
  // Never reply to robots (no mail loops), and at most once a day per address.
  if (isAutomated(email) || !(await withinLimit(admin, `reply:${to}`, 1, 86400))) return;
  const sent = await sendEmail({
    to,
    subject: `Re: ${email.Subject ?? 'your receipt'}`,
    text: [
      'We got your email, but it didn’t come from an address on a Spendly account, so we didn’t read it.',
      '',
      'To forward receipts, add this address in Spendly: Me → Forward receipts → Add an address. Then forward the receipt again.',
    ].join('\n'),
  });
  if (!sent) console.log(`(not sent) Unknown sender reply to ${to}`);
}
