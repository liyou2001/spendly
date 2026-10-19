import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { emailSender, isLocalStack } from './email.ts';

const message = { to: 'leo@gmail.com', subject: '123456 is your Spendly code', text: 'Hi' };

/** Sends with these settings and returns the one request made, if any. */
async function send(env: Record<string, string>, status = 200) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(new Response('{}', { status }));
  };
  const sent = await emailSender((name) => env[name], fetchImpl as typeof fetch)(message);
  const request = requests[0];
  return {
    sent,
    count: requests.length,
    url: request?.url,
    headers: new Headers(request?.init.headers),
    body: request ? JSON.parse(String(request.init.body)) : null,
  };
}

Deno.test('with a Resend key, email goes through Resend from EMAIL_FROM', async () => {
  const result = await send({
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Spendly <hello@spendly.app>',
    SUPABASE_URL: 'https://abc.supabase.co',
  });
  assertEquals(result.sent, true);
  assertEquals(result.url, 'https://api.resend.com/emails');
  assertEquals(result.headers.get('Authorization'), 'Bearer re_test');
  assertEquals(result.body, {
    from: 'Spendly <hello@spendly.app>',
    to: ['leo@gmail.com'],
    subject: message.subject,
    text: 'Hi',
  });

  // Without EMAIL_FROM, nothing is sent.
  assertEquals((await send({ RESEND_API_KEY: 're_test' })).count, 0);
});

Deno.test('locally, email goes to Mailpit', async () => {
  const result = await send({ SUPABASE_URL: 'http://kong:8000' });
  assertEquals(result.sent, true);
  assertEquals(result.url, 'http://inbucket:8025/api/v1/send');
  assertEquals(result.body, {
    From: { Email: 'no-reply@spendly.local', Name: 'Spendly' },
    To: [{ Email: 'leo@gmail.com' }],
    Subject: message.subject,
    Text: 'Hi',
  });
});

Deno.test('blank settings, as copied from .env.example, count as unset', async () => {
  const result = await send({
    SUPABASE_URL: 'http://kong:8000',
    EMAIL_PROVIDER: '',
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    MAILPIT_URL: '',
  });
  assertEquals(result.url, 'http://inbucket:8025/api/v1/send');
  assertEquals(result.body.From, { Email: 'no-reply@spendly.local', Name: 'Spendly' });
});

Deno.test('hosted with no service set up, or a refused send, counts as not sent', async () => {
  const none = await send({ SUPABASE_URL: 'https://abc.supabase.co' });
  assertEquals([none.sent, none.count], [false, 0]);
  const logged = await send({ SUPABASE_URL: 'http://kong:8000', EMAIL_PROVIDER: 'log' });
  assertEquals([logged.sent, logged.count], [false, 0]);
  assertEquals((await send({ SUPABASE_URL: 'http://kong:8000' }, 500)).sent, false);
});

Deno.test('the local stack is told apart from a hosted project', () => {
  assertEquals(
    isLocalStack(() => 'http://kong:8000'),
    true,
  );
  assertEquals(
    isLocalStack(() => 'http://127.0.0.1:54321'),
    true,
  );
  assertEquals(
    isLocalStack(() => 'https://kong.supabase.co'),
    false,
  );
  assertEquals(
    isLocalStack(() => undefined),
    false,
  );
});
