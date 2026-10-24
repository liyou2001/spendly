import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { isDaytime, textSender, transportFromEnv, type TextStore } from './text.ts';

const JEFF = '+16085550123';
// 2pm in New York, 11am in Los Angeles.
const afternoon = new Date('2026-10-23T18:00:00Z');

/** A store where `consents` lists who opted in (and when), recording what's saved. */
function store(consents: Record<string, string>, texted: string[] = []) {
  const saved: { to_phone: string; body: string; status: string; provider_id?: string }[] = [];
  const fake: TextStore = {
    consentedAt: (phone) => Promise.resolve(consents[phone] ?? null),
    textedSince: (phone) => Promise.resolve(texted.includes(phone)),
    record: (row) => {
      saved.push(row);
      return Promise.resolve(`m-${saved.length}`);
    },
  };
  return { fake, saved };
}

Deno.test('a number that didn’t opt in itself is never texted', async () => {
  const { fake, saved } = store({});
  const send = textSender(
    fake,
    () => Promise.resolve('x'),
    () => afternoon,
  );
  assertEquals(await send({ to: JEFF, body: 'Hi', timeZone: null }), {
    status: 'refused',
    reason: 'no_consent',
  });
  assertEquals(saved, []);
});

Deno.test('the first text after opting in says how to stop; later ones don’t', async () => {
  const first = store({ [JEFF]: '2026-10-20T00:00:00Z' });
  await textSender(
    first.fake,
    null,
    () => afternoon,
  )({ to: JEFF, body: 'You owe Leo $15.00.', timeZone: null });
  assertEquals(first.saved, [
    {
      to_phone: JEFF,
      body: 'Spendly: You owe Leo $15.00. Reply STOP to opt out.',
      status: 'logged',
    },
  ]);

  const later = store({ [JEFF]: '2026-10-20T00:00:00Z' }, [JEFF]);
  await textSender(
    later.fake,
    null,
    () => afternoon,
  )({ to: JEFF, body: 'You owe Leo $15.00.', timeZone: null });
  assertEquals(later.saved[0]?.body, 'Spendly: You owe Leo $15.00.');
});

Deno.test('no texts between 9pm and 9am', async () => {
  const { fake, saved } = store({ [JEFF]: '2026-10-20T00:00:00Z' });
  const at = (iso: string) => textSender(fake, null, () => new Date(iso));
  // 10pm in New York.
  assertEquals(
    await at('2026-10-24T02:00:00Z')({ to: JEFF, body: 'Hi', timeZone: 'America/New_York' }),
    { status: 'refused', reason: 'night' },
  );
  assertEquals(saved, []);

  assertEquals(isDaytime('America/New_York', afternoon), true);
  // 10am in New York is 7am in Los Angeles: without a time zone, that's too early.
  assertEquals(isDaytime(null, new Date('2026-10-23T14:00:00Z')), false);
  assertEquals(isDaytime('America/New_York', new Date('2026-10-23T14:00:00Z')), true);
});

Deno.test('a provider’s refusal is saved as failed', async () => {
  const { fake, saved } = store({ [JEFF]: '2026-10-20T00:00:00Z' });
  const send = textSender(
    fake,
    () => Promise.reject(new Error('Twilio 400: bad number')),
    () => afternoon,
  );
  const result = await send({ to: JEFF, body: 'Hi', timeZone: null });
  assertEquals(result.status, 'failed');
  assertEquals(saved[0]?.status, 'failed');
});

/** The request a provider is sent for one text. */
async function providerRequest(env: Record<string, string>, reply: unknown) {
  let request: { url: string; init: RequestInit } | null = null;
  const fetchImpl = (url: string | URL | Request, init?: RequestInit) => {
    request = { url: String(url), init: init ?? {} };
    return Promise.resolve(Response.json(reply));
  };
  const transport = transportFromEnv((name) => env[name], fetchImpl as typeof fetch);
  const id = await transport?.(JEFF, 'Spendly: Hi');
  return { id, request: request as { url: string; init: RequestInit } | null };
}

Deno.test('Twilio and Telnyx get the text; without SMS_PROVIDER it’s only logged', async () => {
  const twilio = await providerRequest(
    {
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM_NUMBER: '+15005550006',
    },
    { sid: 'SM1' },
  );
  assertEquals(twilio.id, 'SM1');
  assertEquals(twilio.request?.url, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
  assertEquals(
    String(twilio.request?.init.body),
    new URLSearchParams({ To: JEFF, From: '+15005550006', Body: 'Spendly: Hi' }).toString(),
  );

  const telnyx = await providerRequest(
    { SMS_PROVIDER: 'telnyx', TELNYX_API_KEY: 'KEY', TELNYX_FROM_NUMBER: '+15005550006' },
    { data: { id: 'tx-1' } },
  );
  assertEquals(telnyx.id, 'tx-1');
  assertEquals(JSON.parse(String(telnyx.request?.init.body)), {
    from: '+15005550006',
    to: JEFF,
    text: 'Spendly: Hi',
  });

  assertEquals(
    transportFromEnv(() => undefined),
    null,
  );
  assertEquals(
    transportFromEnv((name) => (name === 'SMS_PROVIDER' ? 'log' : undefined)),
    null,
  );
});
