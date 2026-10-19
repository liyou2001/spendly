// inbound-email: forwarded receipts. Everyone forwards to one shared address; the sender's
// verified address says whose it is. Cloudflare Email Routing hands each email to a small
// Worker (apps/email-worker), which posts the raw message here with a shared secret. It answers
// straight away and reads the email in the background. The email itself is never stored: only
// who sent it and what became of it (inbound_emails).
import { adminClient, withinLimit, type AdminClient } from '../_shared/admin.ts';
import { isLocalStack, sendEmail } from '../_shared/email.ts';
import { fail, json } from '../_shared/http.ts';
import { domainOf, isAutomated, type AuthPass, type InboundEmail } from '../_shared/inbound.ts';
import { verifiedAuth } from '../_shared/mailauth.ts';
import { parseRawEmail } from '../_shared/mime.ts';
import { pushToUser } from '../_shared/push.ts';
import { receiptReader } from '../_shared/reader.ts';
import { monthlyScanLimit } from '../_shared/receipt.ts';

import { processEmail, type InboundDeps } from './process.ts';

/** Cloudflare's limit for an email. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Compares without stopping at the first difference. */
function sameSecret(given: string, secret: string): boolean {
  let diff = given.length ^ secret.length;
  for (let i = 0; i < Math.max(given.length, secret.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Locally only (npm run email:test): X-Test-Sender stands in for the SPF pass Cloudflare would
 * add, since nothing can sign as Cloudflare on your computer. Ignored once hosted.
 */
function testPasses(req: Request): AuthPass[] {
  const address = req.headers.get('X-Test-Sender')?.trim().toLowerCase();
  if (!address || !isLocalStack()) return [];
  return [{ method: 'spf', domain: domainOf(address), address }];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');
  const secret = Deno.env.get('INBOUND_SECRET');
  if (!secret) {
    console.error('INBOUND_SECRET is not set');
    return fail(503, 'Not set up');
  }
  if (!sameSecret(req.headers.get('X-Inbound-Secret') ?? '', secret)) {
    return fail(401, 'Unauthorized');
  }
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BYTES) return fail(413, 'Too big');

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length === 0 || raw.length > MAX_BYTES) return fail(400, 'Not an email');
  let email: InboundEmail;
  try {
    email = await parseRawEmail(raw, req.headers.get('X-Envelope-From'));
  } catch {
    return fail(400, 'Not an email');
  }

  const admin = adminClient();
  const { data: row, error } = await admin
    .from('inbound_emails')
    .insert({
      provider_message_id: email.MessageID,
      from_address: email.From.slice(0, 320),
      subject: email.Subject?.slice(0, 300) ?? null,
      status: 'received',
    })
    .select('id')
    .single();
  // A retried delivery is only read once.
  if (error?.code === '23505') return json({ ok: true, duplicate: true });
  if (error || !row) {
    console.error(error);
    return fail(500, 'Couldn’t save it');
  }

  const test = testPasses(req);
  const work = verifiedAuth(raw).then((auth) =>
    processEmail({ ...email, Auth: [...auth, ...test] }, liveDeps(admin, row.id)),
  );
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
  const to = email.From.toLowerCase();
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
