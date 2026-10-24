// What each due reminder becomes: a push to the person who owes, a text to someone without the
// app who opted in, or a push to the person owed to remind them themselves. With the database,
// pushes and texts passed in so every case can be tested.
import { formatUsd } from '../_shared/http.ts';
import type { PushMessage } from '../_shared/push.ts';
import type { TextMessage, TextResult } from '../_shared/text.ts';

/** A row of due_reminders(). */
export interface DueReminder {
  group_id: string;
  group_name: string;
  debtor_id: string;
  debtor_name: string;
  debtor_user_id: string | null;
  creditor_id: string;
  creditor_name: string;
  creditor_user_id: string;
  time_zone: string | null;
  amount_cents: number;
  oldest_unpaid_at: string;
  channel: 'push' | 'text' | 'nudge';
  phone: string | null;
}

export interface RemindDeps {
  push(userId: string, message: PushMessage): Promise<void>;
  text(message: TextMessage): Promise<TextResult>;
  /** A new private payment link for the debtor, or null if there's no payment page to link to. */
  paymentLink(debtorId: string, creditorId: string): Promise<string | null>;
  /** Saves that this debt was reminded about. */
  record(due: DueReminder, outboundMessageId: string | null): Promise<void>;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function age(due: DueReminder, now: Date): string {
  const days = Math.max(1, Math.floor((now.getTime() - Date.parse(due.oldest_unpaid_at)) / DAY_MS));
  return days === 1 ? '1 day' : `${days} days`;
}

/** Sends each reminder, and records the ones that went out. Returns how many did. */
export async function sendReminders(due: DueReminder[], deps: RemindDeps): Promise<number> {
  let sent = 0;
  for (const reminder of due) {
    const amount = formatUsd(reminder.amount_cents);
    const since = age(reminder, deps.now);
    try {
      if (reminder.channel === 'push' && reminder.debtor_user_id) {
        await deps.push(reminder.debtor_user_id, {
          title: `You owe ${reminder.creditor_name} ${amount}`,
          body: `From ${reminder.group_name}, ${since} ago. Tap to see it and pay.`,
          url: `/people/${reminder.creditor_id}`,
        });
        await deps.record(reminder, null);
      } else if (reminder.channel === 'text' && reminder.phone) {
        const link = await deps.paymentLink(reminder.debtor_id, reminder.creditor_id);
        const result = await deps.text({
          to: reminder.phone,
          body: `You owe ${reminder.creditor_name} ${amount} from ${reminder.group_name}.${link ? ` See it and pay: ${link}` : ''}`,
          timeZone: reminder.time_zone,
        });
        // Only what went out counts; anything else is tried again next hour.
        if (result.status !== 'sent' && result.status !== 'logged') continue;
        await deps.record(reminder, result.id);
      } else if (reminder.channel === 'nudge') {
        await deps.push(reminder.creditor_user_id, {
          title: `${reminder.debtor_name} still owes you ${amount}`,
          body: `It’s been ${since}. Send ${reminder.debtor_name} a reminder from your phone.`,
          url: `/people/${reminder.debtor_id}`,
        });
        await deps.record(reminder, null);
      } else {
        continue;
      }
      sent++;
    } catch (e) {
      console.error('Reminder failed', reminder.group_id, reminder.debtor_id, e);
    }
  }
  return sent;
}
