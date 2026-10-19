// Request and response helpers shared by the Edge Functions.

// The payment page is a static site on another origin and sends no cookies, so any origin may
// call these; the link token is what grants access.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function fail(status: number, error: string): Response {
  return json({ error }, status);
}

export const TOO_MANY = 'Too many tries. Wait a minute and try again.';

/**
 * The caller's address, for rate limits. Prefers headers the proxies in front of Supabase set
 * themselves (a caller can't fake them), and only then x-forwarded-for, whose first entry a
 * caller can write.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Link tokens are 32 URL-safe characters (see create_share_link). */
export function isToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/** The SHA-256 of a token, in hex: what share_links stores. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads a JSON object body, or null if it isn't one. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/**
 * Turns a database error into a response. Messages for invalid input and missing links were
 * written for people (see the migrations); anything else is logged and kept vague.
 */
export function dbError(error: { code?: string; message: string }): Response {
  if (error.code === 'P0002')
    return fail(404, 'This link doesn’t work anymore. Ask for a new one.');
  if (error.code === '22023') return fail(400, error.message);
  if (error.code === '23514') return fail(400, 'That doesn’t look like a phone number.');
  console.error(error);
  return fail(500, 'Something went wrong. Try again.');
}

/** "$15.00" from 1500. */
export function formatUsd(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100)
    .toString()
    .replace(/\B(?=(\d{3})+$)/g, ',');
  return `${cents < 0 ? '-' : ''}$${dollars}.${(Math.abs(cents) % 100).toString().padStart(2, '0')}`;
}

/**
 * A typed US phone number in E.164 (+16085551234), or null if it isn't one. The same rules as
 * the app's normalizePhone.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s().-]/g, '');
  let digits: string;
  if (cleaned.startsWith('+')) digits = cleaned.slice(1);
  else if (/^\d{10}$/.test(cleaned)) digits = `1${cleaned}`;
  else if (/^1\d{10}$/.test(cleaned)) digits = cleaned;
  else return null;
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}
