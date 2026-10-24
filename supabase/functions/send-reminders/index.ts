// send-reminders: called every hour by pg_cron (private.request_reminders) with a shared secret
// (CRON_SECRET). Sends what due_reminders() says is due: pushes, texts through sendText(), and
// nudges to remind someone yourself.
import { adminClient, type AdminClient } from '../_shared/admin.ts';
import { fail, json, sameSecret, sha256Hex } from '../_shared/http.ts';
import { pushToUser } from '../_shared/push.ts';
import { sendText } from '../_shared/text.ts';

import { sendReminders, type DueReminder, type RemindDeps } from './remind.ts';

/** A 32-character token, like create_share_link makes. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function liveDeps(admin: AdminClient): RemindDeps {
  const payPage = Deno.env.get('PAY_PAGE_URL')?.trim().replace(/\/$/, '');
  return {
    push: (userId, message) => pushToUser(admin, userId, message),
    text: (message) => sendText(admin, message),
    paymentLink: async (debtorId, creditorId) => {
      if (!payPage) return null;
      const token = newToken();
      const { error } = await admin.from('share_links').insert({
        participant_id: debtorId,
        requested_by: creditorId,
        token_hash: await sha256Hex(token),
      });
      if (error) throw error;
      return `${payPage}/#${token}`;
    },
    record: async (due, outboundMessageId) => {
      const { error } = await admin.from('reminders').insert({
        group_id: due.group_id,
        debtor_id: due.debtor_id,
        creditor_id: due.creditor_id,
        amount_cents: due.amount_cents,
        channel: due.channel,
        outbound_message_id: outboundMessageId,
      });
      if (error) throw error;
    },
    now: new Date(),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) {
    console.error('CRON_SECRET is not set');
    return fail(503, 'Not set up');
  }
  if (!sameSecret(req.headers.get('X-Cron-Secret') ?? '', secret)) return fail(401, 'Unauthorized');

  const admin = adminClient();
  const { data, error } = await admin.rpc('due_reminders');
  if (error) {
    console.error(error);
    return fail(500, 'Couldn’t list reminders');
  }
  const due = (data ?? []) as DueReminder[];
  const sent = await sendReminders(due, liveDeps(admin));
  return json({ due: due.length, sent });
});
