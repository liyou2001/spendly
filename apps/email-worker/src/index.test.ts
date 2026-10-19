import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { inboundRequest, type Env } from './index';

const env: Env = {
  INBOUND_URL: 'https://abc.supabase.co/functions/v1/inbound-email',
  INBOUND_SECRET: 's3cret',
};
const raw = 'From: leo@gmail.com\r\nSubject: Fwd: order\r\n\r\nOrder total $42.10\r\n';

function message() {
  return {
    from: 'leo+caf_=receipts=in.spendly.app@gmail.com',
    to: 'receipts@in.spendly.app',
    raw: new Response(raw).body as ReadableStream<Uint8Array>,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('inboundRequest', () => {
  it('posts the raw email with the secret and the envelope', async () => {
    const request = await inboundRequest(message(), env);
    expect(request.method).toBe('POST');
    expect(request.url).toBe(env.INBOUND_URL);
    expect(request.headers.get('X-Inbound-Secret')).toBe('s3cret');
    expect(request.headers.get('X-Envelope-From')).toBe(
      'leo+caf_=receipts=in.spendly.app@gmail.com',
    );
    expect(request.headers.get('X-Envelope-To')).toBe('receipts@in.spendly.app');
    expect(request.headers.get('Content-Type')).toBe('message/rfc822');
    expect(await request.text()).toBe(raw);
  });
});

describe('email', () => {
  it('fails when the function doesn’t take the email, so it isn’t lost silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('Unauthorized', { status: 401 }))),
    );
    await expect(worker.email(message(), env)).rejects.toThrow('inbound-email answered 401');
  });

  it('succeeds when the function took it', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{"ok":true}')));
    vi.stubGlobal('fetch', fetch);
    await worker.email(message(), env);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
