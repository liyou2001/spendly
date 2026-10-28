// Turning a scanned receipt into the Add expense form (Step 9). Pure, so it's unit tested.
import { formatAmount, formatCents, type Cents } from '@spendly/ledger';

import { monthDay } from './dates';
import type { Draft, SplitOptions } from './split';

/** The draft extract-receipt returns. Amounts are whole cents; the lines were added up in code. */
export interface ScannedReceipt {
  merchant: string | null;
  date: string | null;
  /** amount_cents is the line's total, for all `quantity` of it. */
  items: { name: string; quantity: number; amount_cents: Cents }[];
  tax_cents: Cents;
  tip_cents: Cents;
  discount_cents: Cents;
  total_cents: Cents;
  /** Claude's category suggestion, by name. Merchant rules come first. */
  category: string | null;
}

export type ScanResult =
  | { status: 'ok'; receipt: ScannedReceipt; scans_left: number }
  /** The lines read don't add up to the total, off by gap_cents (lines minus total). */
  | { status: 'mismatch'; receipt: ScannedReceipt; gap_cents: Cents; scans_left: number }
  | { status: 'unreadable'; problem: string; scans_left: number };

/** The scan's lines as an itemized draft. Every item starts as yours, to assign on screen. */
export function draftFromReceipt(
  receipt: ScannedReceipt,
  base: Draft,
  options: SplitOptions = { decimalSeparator: '.' },
): Draft {
  const typed = (cents: Cents) => formatAmount(cents).replace('.', options.decimalSeparator);
  return {
    ...base,
    mode: 'items',
    items: receipt.items.map((item, index) => ({
      key: `scan-${index}`,
      name: item.name,
      amount: typed(item.amount_cents),
      quantity: item.quantity > 1 ? String(item.quantity) : '',
      assignment: { kind: 'you' },
    })),
    tax: receipt.tax_cents > 0 ? typed(receipt.tax_cents) : null,
    tip: receipt.tip_cents > 0 ? typed(receipt.tip_cents) : null,
    discount: receipt.discount_cents > 0 ? typed(receipt.discount_cents) : null,
  };
}

// Merchant names that clearly belong to one default category. Checked before Claude's guess.
const MERCHANT_RULES: [RegExp, string][] = [
  [
    /\b(costco|trader joe'?s|safeway|whole foods|kroger|aldi|wegmans|publix|sprouts|h-?e-?b|food lion|stop ?& ?shop|grocery|market)\b/i,
    'Groceries',
  ],
  [
    /\b(starbucks|chipotle|mcdonald'?s|subway|panera|doordash|uber ?eats|grubhub|domino'?s|pizza|cafe|coffee|restaurant|taqueria|burger|sweetgreen|chick-fil-a|bar & grill)\b/i,
    'Dining',
  ],
  [
    /\b(uber|lyft|shell|chevron|exxon|mobil|amtrak|greyhound|parking|transit|metro card|gas station)\b/i,
    'Transport',
  ],
  [/\b(amc|regal|cinema|theatre|theater|steam|ticketmaster|bowling|arcade)\b/i, 'Fun'],
];

/**
 * The category to start with: a merchant rule's, else Claude's suggestion, if it's one of your
 * categories. null leaves it for you to pick. (Uber Eats is Dining, not Transport.)
 */
export function categoryForReceipt(
  merchant: string | null,
  suggestion: string | null,
  categories: readonly { id: string; name: string }[],
): string | null {
  const byName = (name: string | null) =>
    name ? (categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null) : null;
  const rule = merchant ? MERCHANT_RULES.find(([pattern]) => pattern.test(merchant)) : undefined;
  return byName(rule?.[1] ?? null) ?? byName(suggestion);
}

/**
 * How the lines on screen compare with the receipt's total: null when they match (or nothing
 * adds up yet), otherwise the message to show.
 */
export function totalCheck(receiptTotal: Cents, onScreen: Cents | null): string | null {
  if (onScreen === null || onScreen === receiptTotal) return null;
  const diff = Math.abs(onScreen - receiptTotal);
  return `These lines add up to ${formatCents(onScreen)}, but the receipt says ${formatCents(receiptTotal)} (${formatCents(diff)} ${onScreen > receiptTotal ? 'over' : 'short'}). Check the amounts against your receipt.`;
}

/**
 * Whether the form has anything a scan would replace: a store, an item, an amount, a person
 * chosen, or tax, tip, discount or a total. Scanning then asks first.
 */
export function hasEnteredDetails(draft: Draft, merchant: string): boolean {
  if (merchant.trim()) return true;
  if (draft.tax?.trim() || draft.tip?.trim() || draft.discount?.trim()) return true;
  if (draft.quickTotal.trim()) return true;
  return draft.items.some(
    (item) =>
      item.name.trim() ||
      item.amount.trim() ||
      item.quantity.trim() ||
      item.assignment.kind !== 'you',
  );
}

/** How many receipt scans you have left this month, and when they come back (scan-allowance). */
export interface ScanAllowance {
  left: number;
  limit: number;
  /** The first of next month, "2026-11-01". */
  resetsOn: string;
}

/** At or below this, the count is shown with an attention dot. */
export const LOW_SCANS = 5;

/**
 * The quiet line under the scan buttons. `low` adds the attention dot; `none` replaces the
 * buttons, since a scan would be refused.
 */
export function scansLeftLabel(allowance: ScanAllowance): {
  text: string;
  low: boolean;
  none: boolean;
} {
  const { left, limit, resetsOn } = allowance;
  if (left <= 0) {
    return {
      text: `You’ve used all ${limit} scans this month. Enter this one by hand. Scans come back ${monthDay(resetsOn)}.`,
      low: true,
      none: true,
    };
  }
  return {
    text: `${left} ${left === 1 ? 'scan' : 'scans'} left this month`,
    low: left <= LOW_SCANS,
    none: false,
  };
}
