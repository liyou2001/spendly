// What we can prove about who sent an email, from signatures checked here against DNS. Any
// Authentication-Results or Received-SPF header in the email could have been written by the
// sender, so none is read. Two sources:
//   - DKIM signatures in the email, verified here (a manual forward from Gmail, Outlook or a
//     school address is signed by its domain).
//   - Cloudflare's own stamp (ARC-Authentication-Results from mx.cloudflare.net), only when its
//     ARC seal verifies with Cloudflare's key, it's the newest one, and it was made in the last
//     few minutes (so an older Cloudflare stamp from someone else's hop can't pass as ours). It
//     has the SPF result for the envelope sender, which is how Gmail filter forwards are matched.
import { Buffer } from 'node:buffer';
import { arc } from 'npm:mailauth@7.1.1/lib/arc/index.js';
import { dkimVerify } from 'npm:mailauth@7.1.1/lib/dkim/verify.js';

import { domainOf, type AuthPass } from './inbound.ts';

/** mailauth's DNS lookup: TXT records as lists of strings, like node:dns resolveTxt. */
export type Resolver = (name: string, type: string) => Promise<string[][]>;

/** The receiving server whose stamp we trust. */
export interface Receiver {
  authservId: string;
  sealDomain: string;
}

/** How old Cloudflare's seal may be: it's made as the email arrives, moments before we read it. */
const MAX_SEAL_AGE_MS = 15 * 60 * 1000;
/** Clocks a little ahead. */
const MAX_SEAL_SKEW_MS = 5 * 60 * 1000;

export const CLOUDFLARE: Receiver = {
  authservId: 'mx.cloudflare.net',
  sealDomain: 'email.cloudflare.net',
};

function dnsError(code: string, name: string) {
  return Object.assign(new Error(`${code} ${name}`), { code });
}

/** TXT lookups over DNS-over-HTTPS (Cloudflare's 1.1.1.1), which works wherever fetch does. */
export const dohResolver: Resolver = async (name, type) => {
  if (type !== 'TXT') throw dnsError('ENODATA', name);
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw dnsError('ESERVFAIL', name);
  const body = (await response.json()) as {
    Status: number;
    Answer?: { type: number; data: string }[];
  };
  if (body.Status === 3) throw dnsError('ENOTFOUND', name);
  const answers = (body.Answer ?? []).filter((a) => a.type === 16);
  if (answers.length === 0) throw dnsError('ENODATA', name);
  return answers.map((a) =>
    [...a.data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => (m[1] ?? '').replace(/\\(.)/g, '$1')),
  );
};

interface Stamp {
  mta?: string;
  spf?: { result?: string; smtp?: { mailfrom?: string } };
  dkim?: { result?: string; header?: { d?: string } }[];
  dmarc?: { result?: string; header?: { from?: string } };
}

/** The passes in a trusted stamp. */
function stampPasses(stamp: Stamp): AuthPass[] {
  const passes: AuthPass[] = [];
  const mailfrom = stamp.spf?.smtp?.mailfrom?.toLowerCase();
  if (stamp.spf?.result === 'pass' && mailfrom) {
    passes.push({
      method: 'spf',
      domain: domainOf(mailfrom),
      address: mailfrom.includes('@') ? mailfrom : null,
    });
  }
  for (const dkim of stamp.dkim ?? []) {
    if (dkim.result === 'pass' && dkim.header?.d) {
      passes.push({ method: 'dkim', domain: domainOf(dkim.header.d), address: null });
    }
  }
  if (stamp.dmarc?.result === 'pass' && stamp.dmarc.header?.from) {
    passes.push({ method: 'dmarc', domain: domainOf(stamp.dmarc.header.from), address: null });
  }
  return passes;
}

/** Every pass we can prove for this raw email. Never throws: if checking fails, nothing passes. */
export async function verifiedAuth(
  raw: Uint8Array | string,
  resolver: Resolver = dohResolver,
  receiver: Receiver = CLOUDFLARE,
  now = Date.now(),
): Promise<AuthPass[]> {
  try {
    const input =
      typeof raw === 'string' ? raw : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    const dkim = await dkimVerify(input, { resolver });
    const passes: AuthPass[] = (dkim.results ?? []).flatMap((r) =>
      r.status?.result === 'pass' && r.signingDomain
        ? [{ method: 'dkim' as const, domain: domainOf(r.signingDomain), address: null }]
        : [],
    );
    if (!dkim.arc) return passes;

    // arc() treats a message without ARC headers (chain: false) as "none".
    const chain = await arc(dkim.arc as Parameters<typeof arc>[0], { resolver });
    const seal = dkim.arc.lastEntry?.['arc-seal']?.parsed;
    const sealDomain = String(seal?.d?.value ?? '');
    const sealedAt = Number(seal?.t?.value) * 1000;
    const signedBy = chain.signature ? chain.signature.signingDomain : '';
    const stamp = chain.authenticationResults as Stamp | undefined;
    if (
      chain.status?.result === 'pass' &&
      sealDomain.toLowerCase() === receiver.sealDomain &&
      sealedAt >= now - MAX_SEAL_AGE_MS &&
      sealedAt <= now + MAX_SEAL_SKEW_MS &&
      signedBy?.toLowerCase() === receiver.sealDomain &&
      stamp?.mta?.toLowerCase() === receiver.authservId
    ) {
      passes.push(...stampPasses(stamp));
    }
    return passes;
  } catch (e) {
    console.error('Couldn’t check the email’s signatures', e);
    return [];
  }
}
