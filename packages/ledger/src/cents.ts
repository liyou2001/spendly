import { LedgerError } from './errors';
import type { Cents } from './types';

/**
 * Money is always a whole number of cents (Rule 1).
 * Returns true only for safe integers, so 1500 passes and 15.0001 does not.
 */
export function isCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

// Optional "$", then digits (with or without correct thousands commas), then up to 2 decimals.
const AMOUNT = /^\$?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/;

/**
 * Parses what a user typed into cents: "$12.34", "12.34", "12", "1,234.5", ".99".
 * Returns null for anything else, including negatives, more than 2 decimals,
 * and amounts too large to hold exactly.
 */
export function parseCents(input: string): Cents | null {
  const match = AMOUNT.exec(input.trim());
  if (!match) return null;

  const whole = (match[1] ?? '').replaceAll(',', '');
  const fraction = match[2] ?? '';
  if (whole === '' && fraction === '') return null;

  const cents = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/** Formats cents for display: 123456 -> "$1,234.56", -1500 -> "-$15.00". */
export function formatCents(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) {
    throw new LedgerError(`Expected whole cents, got ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+$)/g, ',');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}
