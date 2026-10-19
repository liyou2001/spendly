import { assertEquals } from 'jsr:@std/assert@1.0.13';
import { generateKeyPairSync } from 'node:crypto';
import { sealMessage } from 'npm:mailauth@7.1.1/lib/arc/index.js';
import { dkimSign } from 'npm:mailauth@7.1.1/lib/dkim/sign.js';

import { CLOUDFLARE, verifiedAuth, type Resolver } from './mailauth.ts';

/** A signing key, and its DKIM record published (in the fake DNS) for `domain`. */
const records: Record<string, string> = {};
function key(domain: string, selector: string): string {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  records[`${selector}._domainkey.${domain}`] =
    `v=DKIM1; k=rsa; p=${btoa(String.fromCharCode(...der))}`;
  return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
}
const resolver: Resolver = (name, type) => {
  const record = records[name];
  if (type === 'TXT' && record) return Promise.resolve([[record]]);
  return Promise.reject(Object.assign(new Error(`ENOTFOUND ${name}`), { code: 'ENOTFOUND' }));
};

const gmailKey = key('gmail.com', 's1');
const cloudflareKey = key('email.cloudflare.net', 'cf');
const evilKey = key('evil.example', 'x');

const email = [
  'From: Leo <leo@gmail.com>',
  'To: receipts@in.spendly.app',
  'Subject: Fwd: order',
  'Message-ID: <abc@gmail.com>',
  'Date: Sun, 18 Oct 2026 10:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Order total $42.10',
  '',
].join('\r\n');

async function signed(message: string, domain: string, selector: string, privateKey: string) {
  // mailauth signs from signatureData; its type definition doesn't list it.
  const options = { signatureData: [{ signingDomain: domain, selector, privateKey }] };
  const result = await dkimSign(message, options as unknown as Parameters<typeof dkimSign>[1]);
  return result.signatures + message;
}

async function sealed(
  message: string,
  stamp: string,
  domain = 'email.cloudflare.net',
  selector = 'cf',
  privateKey = cloudflareKey,
) {
  const headers = await sealMessage(message, {
    signingDomain: domain,
    selector,
    privateKey,
    authResults: stamp,
    cv: message.includes('ARC-Seal:') ? 'pass' : 'none',
  });
  return new TextDecoder().decode(headers) + message;
}

const stamp =
  'mx.cloudflare.net; spf=pass smtp.mailfrom=leo+caf_=receipts=in.spendly.app@gmail.com; dkim=pass header.d=amazon.com';
const filterPasses = [
  { method: 'spf', domain: 'gmail.com', address: 'leo+caf_=receipts=in.spendly.app@gmail.com' },
  { method: 'dkim', domain: 'amazon.com', address: null },
];

Deno.test('a DKIM signature is checked against its domain’s key', async () => {
  const forward = await signed(email, 'gmail.com', 's1', gmailKey);
  assertEquals(await verifiedAuth(forward, resolver), [
    { method: 'dkim', domain: 'gmail.com', address: null },
  ]);
  // Changed after signing, or signed with someone else's key: nothing passes.
  assertEquals(await verifiedAuth(forward.replace('$42.10', '$4.10'), resolver), []);
  assertEquals(await verifiedAuth(await signed(email, 'gmail.com', 's1', evilKey), resolver), []);
});

Deno.test(
  'Cloudflare’s stamp counts only when Cloudflare sealed it just now, and it’s the newest',
  async () => {
    assertEquals(await verifiedAuth(await sealed(email, stamp), resolver), filterPasses);

    // Written by the sender: no seal.
    const written = `ARC-Authentication-Results: i=1; ${stamp}\r\n${email}`;
    assertEquals(await verifiedAuth(written, resolver), []);

    // Sealed by someone else, claiming to be Cloudflare.
    const impostor = await sealed(email, stamp, 'evil.example', 'x', evilKey);
    assertEquals(await verifiedAuth(impostor, resolver), []);

    // A real Cloudflare stamp from an earlier hop, under someone else's newer seal.
    const older = await sealed(await sealed(email, stamp), stamp, 'evil.example', 'x', evilKey);
    assertEquals(await verifiedAuth(older, resolver), []);

    // A real Cloudflare stamp passed on later, as if ours: too old to be ours.
    const real = await sealed(email, stamp);
    const anHourLater = Date.now() + 60 * 60 * 1000;
    assertEquals(await verifiedAuth(real, resolver, CLOUDFLARE, anHourLater), []);
  },
);

Deno.test('a failed DNS lookup means nothing passes', async () => {
  const forward = await signed(email, 'gmail.com', 's1', gmailKey);
  const down: Resolver = () =>
    Promise.reject(Object.assign(new Error('down'), { code: 'ETIMEOUT' }));
  assertEquals(await verifiedAuth(forward, down), []);
});
