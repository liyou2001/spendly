// A raw email (as Cloudflare's Email Worker passes it on) into an InboundEmail.
import PostalMime from 'npm:postal-mime@4.0.4';

import type { InboundEmail } from './inbound.ts';

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The parsed email. Its id is the sender plus the Message-ID: a retry of the same delivery is
 * read once, but two roommates whose Gmail filters forward the same order each get theirs.
 */
export async function parseRawEmail(
  raw: Uint8Array,
  envelopeFrom: string | null,
): Promise<InboundEmail> {
  const parsed = await PostalMime.parse(raw, { attachmentEncoding: 'base64' });
  const messageId = parsed.messageId?.trim();
  const key = messageId
    ? new TextEncoder().encode(`${(envelopeFrom ?? '').toLowerCase()}\n${messageId}`)
    : raw;
  return {
    MessageID: await sha256(key),
    From: parsed.from?.address ?? '',
    ...(envelopeFrom ? { EnvelopeFrom: envelopeFrom } : {}),
    ...(parsed.subject ? { Subject: parsed.subject } : {}),
    ...(parsed.text ? { TextBody: parsed.text } : {}),
    ...(parsed.html ? { HtmlBody: parsed.html } : {}),
    Headers: parsed.headers.map((h) => ({ Name: h.originalKey ?? h.key, Value: h.value })),
    Attachments: parsed.attachments.map((a) => ({
      ...(a.filename ? { Name: a.filename } : {}),
      Content: typeof a.content === 'string' ? a.content : '',
      ContentType: a.mimeType,
    })),
  };
}
