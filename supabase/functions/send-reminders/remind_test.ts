import { assertEquals } from 'jsr:@std/assert@1.0.13';

import type { PushMessage } from '../_shared/push.ts';
import type { TextMessage, TextResult } from '../_shared/text.ts';

import { sendReminders, type DueReminder } from './remind.ts';

const now = new Date('2026-10-23T18:00:00Z');
const jeffOwesLeo: DueReminder = {
  group_id: 'g-apartment',
  group_name: 'Apartment',
  debtor_id: 'p-jeff',
  debtor_name: 'Jeff',
  debtor_user_id: null,
  creditor_id: 'p-leo',
  creditor_name: 'Leo',
  creditor_user_id: 'u-leo',
  time_zone: 'America/New_York',
  amount_cents: 1500,
  oldest_unpaid_at: '2026-10-19T12:00:00Z',
  channel: 'nudge',
  phone: null,
};

async function run(due: DueReminder[], textResult: TextResult = { status: 'logged', id: 'm-1' }) {
  const log = {
    pushes: [] as { userId: string; message: PushMessage }[],
    texts: [] as TextMessage[],
    recorded: [] as { channel: string; outbound: string | null }[],
  };
  const sent = await sendReminders(due, {
    push: (userId, message) => {
      log.pushes.push({ userId, message });
      return Promise.resolve();
    },
    text: (message) => {
      log.texts.push(message);
      return Promise.resolve(textResult);
    },
    paymentLink: () => Promise.resolve('https://pay.example/#tok'),
    record: (reminder, outbound) => {
      log.recorded.push({ channel: reminder.channel, outbound });
      return Promise.resolve();
    },
    now,
  });
  return { sent, ...log };
}

Deno.test('Jeff has the app: he gets a push that opens Leo', async () => {
  const result = await run([{ ...jeffOwesLeo, channel: 'push', debtor_user_id: 'u-jeff' }]);
  assertEquals(result.pushes, [
    {
      userId: 'u-jeff',
      message: {
        title: 'You owe Leo $15.00',
        body: 'From Apartment, 4 days ago. Tap to see it and pay.',
        url: '/people/p-leo',
      },
    },
  ]);
  assertEquals([result.sent, result.recorded], [1, [{ channel: 'push', outbound: null }]]);
});

Deno.test('Jeff opted in to texts: he gets one with a payment link', async () => {
  const result = await run([{ ...jeffOwesLeo, channel: 'text', phone: '+16085550123' }]);
  assertEquals(result.texts, [
    {
      to: '+16085550123',
      body: 'You owe Leo $15.00 from Apartment. See it and pay: https://pay.example/#tok',
      timeZone: 'America/New_York',
    },
  ]);
  assertEquals(result.recorded, [{ channel: 'text', outbound: 'm-1' }]);
});

Deno.test(
  'a text that wasn’t sent (night, STOP since) isn’t counted, so it’s tried again',
  async () => {
    const result = await run([{ ...jeffOwesLeo, channel: 'text', phone: '+16085550123' }], {
      status: 'refused',
      reason: 'no_consent',
    });
    assertEquals([result.sent, result.recorded], [0, []]);
  },
);

Deno.test('Otherwise Leo is nudged to remind Jeff himself', async () => {
  const result = await run([jeffOwesLeo]);
  assertEquals(result.pushes, [
    {
      userId: 'u-leo',
      message: {
        title: 'Jeff still owes you $15.00',
        body: 'It’s been 4 days. Send Jeff a reminder from your phone.',
        url: '/people/p-jeff',
      },
    },
  ]);
  assertEquals(result.recorded, [{ channel: 'nudge', outbound: null }]);
});

Deno.test('one reminder failing doesn’t stop the rest', async () => {
  let calls = 0;
  const sent = await sendReminders([jeffOwesLeo, { ...jeffOwesLeo, debtor_name: 'Maya' }], {
    push: () => (calls++ === 0 ? Promise.reject(new Error('Expo down')) : Promise.resolve()),
    text: () => Promise.reject(new Error('unused')),
    paymentLink: () => Promise.resolve(null),
    record: () => Promise.resolve(),
    now,
  });
  assertEquals(sent, 1);
});
