import type { Category } from './data';

/** Same limit as the check constraint on public.categories.name. */
const MAX_LENGTH = 40;

/**
 * Checks a category name before saving it. Names are trimmed, 1–40 characters, and unique
 * per user ignoring case (the database enforces the same). When renaming, pass the category's
 * own id as `ignoreId` so changing only its capitalization is allowed.
 */
export function validateCategoryName(
  input: string,
  existing: readonly Category[],
  ignoreId?: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = input.trim();
  if (!name) return { ok: false, error: 'Enter a name.' };
  // Count characters the way Postgres does (code points), not UTF-16 units.
  if (Array.from(name).length > MAX_LENGTH) {
    return { ok: false, error: `Keep it to ${MAX_LENGTH} characters or fewer.` };
  }
  const clash = existing.find(
    (c) => c.id !== ignoreId && c.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) return { ok: false, error: `You already have a category called ${clash.name}.` };
  return { ok: true, name };
}
