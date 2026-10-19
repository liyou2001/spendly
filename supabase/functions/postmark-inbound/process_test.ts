import { assertEquals } from 'jsr:@std/assert@1.0.13';

import type { InboundEmail } from '../_shared/inbound.ts';

import { processEmail, type InboundDeps } from './process.ts';

const LEO = 'u-leo';
const amazonOrder = {
  readable: true,
  merchant: 'Amazon',
  date: '2026-10-18',
  items: [
    { name: 'USB-C cable', quantity: 1, amount_cents: 1299 },
    { name: 'Desk lamp', quantity: 1, amount_cents: 2911 },
  ],
  discounts: [],
  taxes: [],
  tip_cents: null,
  total_cents: 4210,
};

const fromLeo: InboundEmail = {
  MessageID: 'm-1',
  From: 'leo@gmail.com',
  FromFull: { Email: 'leo@gmail.com' },
  Subject: 'Fwd: Your Amazon.com order',
  TextBody: 'Order total $42.10: USB-C cable $12.99, Desk lamp $29.11',
  Headers: [{ Name: 'Received-SPF', Value: 'Pass envelope-from=leo@gmail.com' }],
};

/** processEmail with fakes: Leo owns leo@gmail.com; the model replies with `reply`. */
async function run(
  email: InboundEmail,
  overrides: Partial<InboundDeps> & { reply?: unknown } = {},
) {
  const log = {
    updates: [] as Record<string, unknown>[],
    drafts: 0,
    pushes: [] as string[],
    replies: 0,
    codes: [] as string[],
  };
  const deps: InboundDeps = {
    update: (fields) => {
      log.updates.push(fields);
      return Promise.resolve();
    },
    findUser: (addresses) => Promise.resolve(addresses.includes('leo@gmail.com') ? LEO : null),
    saveForwardingCode: (_user, code) => {
      log.codes.push(code);
      return Promise.resolve();
    },
    scansThisMonth: () => Promise.resolve(0),
    categories: () => Promise.resolve(['Fun']),
    recordAttempt: () => Promise.resolve(),
    isDuplicate: () => Promise.resolve(false),
    saveDraft: () => {
      log.drafts++;
      return Promise.resolve('d-1');
    },
    push: (_user, message) => {
      log.pushes.push(message.url);
      return Promise.resolve();
    },
    replyToUnknownSender: () => {
      log.replies++;
      return Promise.resolve();
    },
    reader: {
      provider: 'gemini',
      models: ['first', 'retry'],
      ask: () => Promise.resolve(overrides.reply ?? amazonOrder),
    },
    monthlyLimit: 50,
    receiptsAddress: 'receipts@in.spendly.app',
    ...overrides,
  };
  await processEmail(email, deps);
  return { ...log, status: log.updates.at(-1)?.status };
}

Deno.test('Leo’s forwarded order becomes a draft under Needs you, with a push', async () => {
  const result = await run(fromLeo);
  assertEquals(result.status, 'drafted');
  assertEquals(result.drafts, 1);
  assertEquals(result.pushes, ['/add-expense?draft=d-1']);
});

Deno.test('a stranger gets a reply; a forged From gets nothing', async () => {
  const stranger = await run({
    ...fromLeo,
    From: 'sam@example.com',
    FromFull: { Email: 'sam@example.com' },
    Headers: [{ Name: 'Received-SPF', Value: 'Pass envelope-from=sam@example.com' }],
  });
  assertEquals([stranger.status, stranger.replies, stranger.drafts], ['unknown_sender', 1, 0]);

  const forged = await run({
    ...fromLeo,
    Headers: [{ Name: 'Received-SPF', Value: 'Pass envelope-from=x@evil.example' }],
  });
  assertEquals([forged.status, forged.replies, forged.drafts], ['unknown_sender', 0, 0]);
});

Deno.test('duplicates, the monthly limit and unreadable emails make no draft', async () => {
  assertEquals(
    (await run(fromLeo, { isDuplicate: () => Promise.resolve(true) })).status,
    'duplicate',
  );
  assertEquals(
    (await run(fromLeo, { scansThisMonth: () => Promise.resolve(50) })).status,
    'failed',
  );
  const blurry = await run(fromLeo, { reply: { readable: false, problem: 'not a receipt' } });
  assertEquals(
    [blurry.status, blurry.updates.at(-1)?.error, blurry.drafts],
    ['failed', 'not a receipt', 0],
  );
});

Deno.test('Gmail’s forwarding code is shown only if it really came from Google', async () => {
  const confirmation: InboundEmail = {
    MessageID: 'm-2',
    From: 'forwarding-noreply@google.com',
    FromFull: { Email: 'forwarding-noreply@google.com' },
    Subject: '(#123456789) Gmail Forwarding Confirmation - Receive Mail from leo@gmail.com',
    TextBody:
      'leo@gmail.com has requested to automatically forward mail.\nConfirmation code: 123456789',
    Headers: [{ Name: 'Authentication-Results', Value: 'mx; dkim=pass header.d=google.com' }],
  };
  const real = await run(confirmation);
  assertEquals([real.status, real.codes], ['forwarding_code', ['123456789']]);

  const fake = await run({
    ...confirmation,
    Headers: [{ Name: 'Authentication-Results', Value: 'mx; dkim=pass header.d=evil.example' }],
  });
  assertEquals([fake.codes, fake.status], [[], 'unknown_sender']);
});
