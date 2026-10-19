import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  clientIp,
  dbError,
  formatUsd,
  isToken,
  isUuid,
  normalizePhone,
  sha256Hex,
} from './http.ts';

const request = (headers: Record<string, string>) => new Request('http://x', { headers });

Deno.test('clientIp prefers headers the proxies set over x-forwarded-for', () => {
  assertEquals(
    clientIp(request({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '6.6.6.6, 1.1.1.1' })),
    '1.1.1.1',
  );
  assertEquals(
    clientIp(request({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '6.6.6.6' })),
    '2.2.2.2',
  );
  assertEquals(clientIp(request({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' })), '3.3.3.3');
  assertEquals(clientIp(request({})), 'unknown');
});

Deno.test('tokens and ids are checked before touching the database', () => {
  assertEquals(isToken('a'.repeat(32)), true);
  assertEquals(isToken('a'.repeat(31)), false);
  assertEquals(isToken('a'.repeat(31) + '/'), false);
  assertEquals(isToken(42), false);
  assertEquals(isUuid('33333333-3333-3333-3333-333333330002'), true);
  assertEquals(isUuid('nope'), false);
});

Deno.test('sha256Hex matches what create_share_link stores', async () => {
  assertEquals(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

Deno.test('phone numbers and money read the same as in the app', () => {
  assertEquals(normalizePhone('(608) 555-0123'), '+16085550123');
  assertEquals(normalizePhone('+44 7700 900123'), '+447700900123');
  assertEquals(normalizePhone('555-0123'), null);
  assertEquals(formatUsd(1500), '$15.00');
  assertEquals(formatUsd(123456), '$1,234.56');
});

Deno.test('database errors become messages for people, never internals', async () => {
  const missing = dbError({ code: 'P0002', message: 'internal detail' });
  assertEquals(missing.status, 404);
  assertEquals((await missing.json()).error, 'This link doesn’t work anymore. Ask for a new one.');
  const invalid = dbError({ code: '22023', message: 'That’s more than you owe ($5.00)' });
  assertEquals((await invalid.json()).error, 'That’s more than you owe ($5.00)');
  const other = dbError({ code: '42P01', message: 'relation does not exist' });
  assertEquals(other.status, 500);
  assertEquals((await other.json()).error, 'Something went wrong. Try again.');
});
