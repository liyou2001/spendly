// Incoming texts from Twilio or Telnyx: checking they really came from the provider, and
// whether a reply means "stop texting me".

const STOP_WORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'REVOKE',
  'OPTOUT',
]);

/**
 * Whether a reply asks to stop: it starts with an opt-out word (STOP, "stop texting me",
 * "Unsubscribe.") or is "opt out". When unsure, it counts as stopping.
 */
export function isStop(text: string): boolean {
  const words = text
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .trim()
    .split(/\s+/);
  return STOP_WORDS.has(words[0] ?? '') || (words[0] === 'OPT' && words[1] === 'OUT');
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Twilio's X-Twilio-Signature: base64 HMAC-SHA1, keyed with the auth token, of the URL Twilio
 * called followed by each form field's name and value, sorted by name.
 */
export async function twilioSignatureValid(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string,
): Promise<boolean> {
  const data =
    url +
    [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, value]) => name + value)
      .join('');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['verify'],
  );
  try {
    return await crypto.subtle.verify(
      'HMAC',
      key,
      base64ToBytes(signature),
      new TextEncoder().encode(data),
    );
  } catch {
    return false;
  }
}

/**
 * Telnyx's Ed25519 signature (telnyx-signature-ed25519) of "<telnyx-timestamp>|<body>", made in
 * the last 5 minutes so an old webhook can't be replayed.
 */
export async function telnyxSignatureValid(
  publicKeyBase64: string,
  timestamp: string,
  body: string,
  signatureBase64: string,
  now: Date = new Date(),
): Promise<boolean> {
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now.getTime() - sentAt) > 5 * 60 * 1000) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(publicKeyBase64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      base64ToBytes(signatureBase64),
      new TextEncoder().encode(`${timestamp}|${body}`),
    );
  } catch {
    return false;
  }
}
