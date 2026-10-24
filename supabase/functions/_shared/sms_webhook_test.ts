import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { isStop, telnyxSignatureValid, twilioSignatureValid } from './sms_webhook.ts';

const toBase64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

Deno.test('STOP and the other ways of saying it stop texts; other replies don’t', () => {
  for (const reply of [
    'STOP',
    'stop',
    ' Stop. ',
    'Stop texting me',
    'UNSUBSCRIBE',
    'cancel',
    'quit',
    'end',
    'Opt out',
    'optout',
    'revoke',
  ]) {
    assertEquals(isStop(reply), true, reply);
  }
  for (const reply of ['Thanks!', 'I paid', 'Please don’t stop', 'START', '']) {
    assertEquals(isStop(reply), false, reply);
  }
});

Deno.test(
  'a Twilio webhook is trusted only with its signature over the URL and fields',
  async () => {
    const url = 'https://abc.supabase.co/functions/v1/sms-inbound';
    const params = new URLSearchParams({ From: '+16085550123', To: '+15005550006', Body: 'STOP' });
    // Built separately: the URL, then each field's name and value in name order.
    const signed = `${url}Body` + 'STOP' + 'From+16085550123' + 'To+15005550006';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('auth-token'),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    );
    const signature = toBase64(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed)),
    );

    assertEquals(await twilioSignatureValid('auth-token', url, params, signature), true);
    assertEquals(await twilioSignatureValid('other-token', url, params, signature), false);
    const changed = new URLSearchParams(params);
    changed.set('From', '+16085550199');
    assertEquals(await twilioSignatureValid('auth-token', url, changed, signature), false);
    assertEquals(await twilioSignatureValid('auth-token', url, params, 'not base64!'), false);
  },
);

Deno.test('a Telnyx webhook is trusted only with a recent Ed25519 signature', async () => {
  const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const publicKey = toBase64(await crypto.subtle.exportKey('raw', keys.publicKey));
  const body = JSON.stringify({ data: { event_type: 'message.received' } });
  const now = new Date('2026-10-23T18:00:00Z');
  const timestamp = String(now.getTime() / 1000);
  const sign = async (text: string) =>
    toBase64(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(text)));
  const signature = await sign(`${timestamp}|${body}`);

  assertEquals(await telnyxSignatureValid(publicKey, timestamp, body, signature, now), true);
  assertEquals(await telnyxSignatureValid(publicKey, timestamp, `${body} `, signature, now), false);
  const later = new Date(now.getTime() + 10 * 60 * 1000);
  assertEquals(await telnyxSignatureValid(publicKey, timestamp, body, signature, later), false);
  assertEquals(await telnyxSignatureValid('bm90IGEga2V5', timestamp, body, signature, now), false);
});
