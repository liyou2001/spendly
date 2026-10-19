// Reading an inbound email from Postmark: who sent it, whether that's trustworthy, and what to
// read the receipt from. Pure, so it's unit tested.
import type { ReceiptContent } from './receipt.ts';

/** The parts of Postmark's inbound webhook JSON this uses. */
export interface InboundEmail {
  MessageID: string;
  From: string;
  FromFull?: { Email?: string };
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: { Name: string; Value: string }[];
  Attachments?: { Name?: string; Content: string; ContentType: string }[];
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 30_000;
const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Postmark's JSON, or null if it isn't an inbound email. */
export function parseInbound(body: unknown): InboundEmail | null {
  if (!body || typeof body !== 'object') return null;
  const email = body as Record<string, unknown>;
  if (typeof email.MessageID !== 'string' || !email.MessageID) return null;
  if (typeof email.From !== 'string') return null;
  return email as unknown as InboundEmail;
}

/** Every value of a header, matched without regard to case. */
export function header(email: InboundEmail, name: string): string[] {
  return (email.Headers ?? [])
    .filter((h) => h.Name.toLowerCase() === name.toLowerCase())
    .map((h) => h.Value);
}

/** The bare address in "Jeff Kim <jeff@example.com>", lowercased. */
function addressesIn(text: string): string[] {
  return (text.match(EMAIL) ?? []).map((a) => a.toLowerCase());
}

/** "leo@gmail.com" or "@gmail.com" or "gmail.com" → "gmail.com". */
function domainOf(value: string): string {
  return value
    .toLowerCase()
    .replace(/^.*@/, '')
    .replace(/[>"]+$/, '');
}

/** The same domain, or one inside the other (mail.amazon.com and amazon.com). */
function aligned(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** The visible sender's address, lowercased. */
export function fromAddress(email: InboundEmail): string | null {
  return addressesIn(email.FromFull?.Email ?? email.From)[0] ?? null;
}

/**
 * What the receiving server verified: each SPF, DKIM or DMARC pass, with the domain it was for
 * (and for SPF, the envelope sender address it checked).
 */
export function authPasses(
  email: InboundEmail,
): { method: 'spf' | 'dkim' | 'dmarc'; domain: string; address: string | null }[] {
  const passes: { method: 'spf' | 'dkim' | 'dmarc'; domain: string; address: string | null }[] = [];
  const value = (text: string, key: string) =>
    new RegExp(`${key}=["<]?([^\\s;">]+)`, 'i').exec(text)?.[1] ?? null;

  for (const spf of header(email, 'Received-SPF')) {
    if (!/^\s*pass\b/i.test(spf)) continue;
    const envelope = value(spf, 'envelope-from') ?? value(spf, 'smtp\\.mailfrom');
    if (envelope) {
      passes.push({
        method: 'spf',
        domain: domainOf(envelope),
        address: envelope.includes('@') ? envelope.toLowerCase() : null,
      });
    }
  }
  for (const results of header(email, 'Authentication-Results')) {
    for (const part of results.split(';')) {
      const method = /\b(spf|dkim|dmarc)=pass\b/i.exec(part)?.[1]?.toLowerCase();
      if (method === 'spf') {
        const envelope = value(part, 'smtp\\.mailfrom');
        if (envelope) {
          passes.push({
            method,
            domain: domainOf(envelope),
            address: envelope.includes('@') ? envelope.toLowerCase() : null,
          });
        }
      } else if (method === 'dkim') {
        const domain = value(part, 'header\\.d') ?? value(part, 'header\\.i');
        if (domain) passes.push({ method, domain: domainOf(domain), address: null });
      } else if (method === 'dmarc') {
        const domain = value(part, 'header\\.from');
        if (domain) passes.push({ method, domain: domainOf(domain), address: null });
      }
    }
  }
  return passes;
}

/**
 * Whether the visible From address is really the sender's: SPF, DKIM or DMARC passed for its
 * own domain. A pass for some other domain proves nothing about the From line.
 */
export function fromIsVerified(email: InboundEmail): boolean {
  const from = fromAddress(email);
  return from !== null && authPasses(email).some((pass) => aligned(domainOf(from), pass.domain));
}

/**
 * Addresses this email provably came from, most likely first: the From address if it's
 * verified, then the envelope sender SPF checked. A Gmail filter forwards with the forwarding
 * account as the envelope sender, and only that account can send as it, so that's how an
 * automatically forwarded order (From: Amazon) is matched to the person. Headers like
 * X-Forwarded-For are never trusted: anyone can write them. The shared receipts address
 * itself is never a candidate.
 */
export function verifiedSenders(
  email: InboundEmail,
  receiptsAddress: string | undefined,
): string[] {
  const own = receiptsAddress?.toLowerCase();
  const from = fromAddress(email);
  const found = [
    ...(from && fromIsVerified(email) ? [from] : []),
    ...authPasses(email).flatMap((pass) =>
      pass.method === 'spf' && pass.address ? [pass.address] : [],
    ),
  ];
  return [...new Set(found)].filter((a) => a !== own);
}

/** Mail no one should get an automatic reply to: other robots, lists and bounces. */
export function isAutomated(email: InboundEmail): boolean {
  const auto = header(email, 'Auto-Submitted').some((v) => !/^\s*no\s*$/i.test(v));
  const bulk = header(email, 'Precedence').some((v) => /bulk|list|junk/i.test(v));
  const robot = /no-?reply|mailer-daemon|postmaster|bounce/i.test(email.From);
  return auto || bulk || robot || header(email, 'List-Id').length > 0;
}

/**
 * Gmail's "confirm forwarding" email: the code to type into Gmail, and the address that asked
 * to forward. null for any other email.
 */
export function gmailForwardingCode(
  email: InboundEmail,
): { code: string; requester: string } | null {
  if (!/forwarding-noreply@google\.com/i.test(email.From)) return null;
  const text = `${email.Subject ?? ''}\n${email.TextBody ?? ''}`;
  const code =
    /confirmation code:\s*(\d{6,12})/i.exec(text)?.[1] ?? /\(#(\d{6,12})\)/.exec(text)?.[1];
  const requester =
    /([^\s<>()]+@[^\s<>()]+)\s+has requested to automatically forward/i.exec(text)?.[1] ??
    /receive mail from\s+([^\s<>()]+@[^\s<>()]+)/i.exec(text)?.[1];
  return code && requester ? { code, requester: requester.toLowerCase() } : null;
}

/** An email's HTML as readable text: tags dropped, lines and cells kept apart. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/ {2,}/g, ' ')
    .replace(/[ \t]*\t[ \t]*/g, '\t')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * What to read the receipt from: a PDF or photo attachment if there is one, otherwise the
 * email's text. null if there's nothing worth reading.
 */
export function pickContent(email: InboundEmail): ReceiptContent | null {
  for (const file of email.Attachments ?? []) {
    const type = file.ContentType.toLowerCase();
    const bytes = Math.floor((file.Content.length * 3) / 4);
    if (bytes > MAX_ATTACHMENT_BYTES) continue;
    if (type === 'application/pdf') return { kind: 'pdf', base64: file.Content };
    if (type === 'image/jpeg' || type === 'image/png') {
      return { kind: 'image', base64: file.Content, mediaType: type };
    }
  }
  const text = (email.TextBody?.trim() || htmlToText(email.HtmlBody ?? '')).slice(0, MAX_TEXT);
  return text.length >= 20
    ? { kind: 'text', text: `Subject: ${email.Subject ?? ''}\n\n${text}` }
    : null;
}
