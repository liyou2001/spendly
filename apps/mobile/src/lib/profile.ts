import type { Tables } from '@spendly/db';

/** The profile columns a user can edit (the only ones granted for update). */
export type ProfileFields = Pick<
  Tables<'profiles'>,
  'display_name' | 'username' | 'venmo_username' | 'paypal_username' | 'cashapp_tag'
>;

export type ProfileForm = Record<keyof ProfileFields, string>;
export type ProfileErrors = Partial<Record<keyof ProfileFields, string>>;

export const profileColumns =
  'display_name, username, venmo_username, paypal_username, cashapp_tag';

export function toForm(profile: ProfileFields): ProfileForm {
  return {
    display_name: profile.display_name,
    username: profile.username,
    venmo_username: profile.venmo_username ?? '',
    paypal_username: profile.paypal_username ?? '',
    cashapp_tag: profile.cashapp_tag ?? '',
  };
}

// Same formats as the check constraints on public.profiles, so mistakes are explained here
// instead of coming back as a database error.
const VENMO = /^[A-Za-z0-9_-]{1,30}$/;
const PAYPAL = /^[A-Za-z0-9]{1,20}$/;
const CASHTAG = /^[A-Za-z][A-Za-z0-9]{0,19}$/;
const USERNAME = /^[a-z0-9_.]{3,20}$/;

/**
 * A Spendly username as typed ("@Jeff_K ") cleaned up and checked: lowercase, no "@", and
 * 3–20 letters, numbers, "_" or ".". Blank means nothing was typed.
 */
export function validateUsername(
  input: string,
): { ok: true; username: string } | { ok: false; error: string | null } {
  const username = input.trim().replace(/^@/, '').toLowerCase();
  if (!username) return { ok: false, error: null };
  if (username.length < 3) return { ok: false, error: 'Usernames are at least 3 characters.' };
  if (username.length > 20) return { ok: false, error: 'Usernames are at most 20 characters.' };
  if (!USERNAME.test(username)) {
    return { ok: false, error: 'Use only letters, numbers, _ and .' };
  }
  return { ok: true, username };
}

/**
 * Cleans up what was typed and checks it. People often paste "@name", "paypal.me/name" or
 * "$tag", so those prefixes are dropped. Blank payment fields become null. Cashtags are
 * stored without the "$".
 */
export function validateProfile(
  form: ProfileForm,
): { ok: true; values: ProfileFields } | { ok: false; errors: ProfileErrors } {
  const displayName = form.display_name.trim();
  const venmo = form.venmo_username.trim().replace(/^@/, '');
  const paypal = form.paypal_username
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '')
    .replace(/^@/, '');
  const cashtag = form.cashapp_tag.trim().replace(/^\$/, '');

  const errors: ProfileErrors = {};
  // Count characters the way Postgres does (code points), not UTF-16 units.
  const nameLength = Array.from(displayName).length;
  if (nameLength === 0) errors.display_name = 'Enter the name people will see.';
  else if (nameLength > 80) errors.display_name = 'Keep it to 80 characters or fewer.';
  const username = validateUsername(form.username);
  if (!username.ok) errors.username = username.error ?? 'Choose a username.';
  if (venmo && !VENMO.test(venmo)) {
    errors.venmo_username = 'Venmo usernames are up to 30 letters, numbers, - or _.';
  }
  if (paypal && !PAYPAL.test(paypal)) {
    errors.paypal_username = 'PayPal.Me usernames are up to 20 letters and numbers.';
  }
  if (cashtag && !CASHTAG.test(cashtag)) {
    errors.cashapp_tag = 'Cashtags start with a letter and have up to 20 letters and numbers.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    values: {
      display_name: displayName,
      username: username.ok ? username.username : '',
      venmo_username: venmo || null,
      paypal_username: paypal || null,
      cashapp_tag: cashtag || null,
    },
  };
}
