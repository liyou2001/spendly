/**
 * Turns a typed phone number into E.164 (+16085551234), the form the database stores.
 * US numbers can be typed without the +1. Spaces, dashes, dots and brackets are ignored.
 * Blank means no phone number.
 */
export function normalizePhone(
  input: string,
): { ok: true; phone: string | null } | { ok: false; error: string } {
  const cleaned = input.replace(/[\s().-]/g, '');
  if (cleaned === '') return { ok: true, phone: null };

  let digits: string;
  if (cleaned.startsWith('+')) digits = cleaned.slice(1);
  else if (/^\d{10}$/.test(cleaned)) digits = `1${cleaned}`;
  else if (/^1\d{10}$/.test(cleaned)) digits = cleaned;
  else return { ok: false, error: 'Enter a US number, or start with + and the country code.' };

  if (!/^[1-9]\d{6,14}$/.test(digits)) {
    return { ok: false, error: 'That doesn’t look like a phone number.' };
  }
  return { ok: true, phone: `+${digits}` };
}

/** "+16085550123" as "(608) 555-0123"; other numbers as stored. */
export function formatPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164;
}
