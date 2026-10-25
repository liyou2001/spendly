// Payment requests sent from the user's own phone (Messages or the share sheet), and the
// Venmo / PayPal / Cash App links in them. No payment API: the links open the payment app.
import { formatCents, paymentAppLinks, type Cents, type PaymentHandles } from '@spendly/ledger';

import { joinNames } from './labels';

/** An expense someone owes you for: what they owe on it and the items that were theirs. */
export interface OwedExpense {
  merchant: string;
  expenseDate: string;
  amountCents: Cents;
  /** Names of the items they had a part in, in receipt order. */
  itemNames: string[];
}

/**
 * The expenses a balance most likely comes from: newest first, until their amounts cover it.
 * Payments aren't tied to expenses, so the newest ones are taken as the unpaid ones.
 */
export function expensesBehind<T extends OwedExpense>(
  newestFirst: readonly T[],
  owedCents: Cents,
): T[] {
  const behind: T[] = [];
  let covered = 0;
  for (const expense of newestFirst) {
    if (covered >= owedCents) break;
    behind.push(expense);
    covered += expense.amountCents;
  }
  return behind;
}

/** "10/17" from "2026-10-17". */
function monthDay(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/** A vague payment note, so the payment app's feed doesn't list what was bought. */
export function paymentNote(expenses: readonly OwedExpense[]): string {
  const [first] = expenses;
  if (!first) return 'Spendly';
  if (expenses.length === 1) return `${first.merchant} ${monthDay(first.expenseDate)}`;
  return `${first.merchant} + ${expenses.length - 1} more`;
}

/** A link that opens the payment app with the amount filled in. Venmo first, then PayPal, then Cash App. */
export function paymentLink(
  handles: PaymentHandles,
  amountCents: Cents,
  note: string,
): string | null {
  return paymentAppLinks(handles, amountCents, note)[0]?.url ?? null;
}

/** "Costco (paper towels, dish soap, trash bags)", "Costco on 10/17", "Costco and Target". */
function whatFor(expenses: readonly OwedExpense[]): string {
  const [first] = expenses;
  if (!first) return '';
  if (expenses.length === 1) {
    const items = first.itemNames.map((name) => name.toLowerCase());
    return items.length > 0 && items.length <= 3
      ? `${first.merchant} (${joinNames(items)})`
      : `${first.merchant} on ${monthDay(first.expenseDate)}`;
  }
  const merchants = [...new Set(expenses.map((e) => e.merchant))];
  return merchants.length <= 2
    ? joinNames(merchants)
    : `${merchants.slice(0, 2).join(', ')} and ${merchants.length - 2} more`;
}

/**
 * The text for a payment request, e.g. "Hey Jeff, you owe $15.00 for Costco (paper towels,
 * dish soap and trash bags). See your share and pay here: https://...". The link is the private
 * payment page, or a payment app link where there's no page.
 */
export function requestMessage(input: {
  firstName: string;
  owedCents: Cents;
  expenses: readonly OwedExpense[];
  link: string | null;
}): string {
  const reason = whatFor(input.expenses);
  const owe = `Hey ${input.firstName}, you owe ${formatCents(input.owedCents)}${reason ? ` for ${reason}` : ''}.`;
  return input.link ? `${owe} See your share and pay here: ${input.link}` : `${owe} Thanks!`;
}

/**
 * A link that opens Messages to `phone` with `body` filled in, for browsers (the phone app uses
 * expo-sms). `?&body=` works on both iPhone (which reads `&body=`) and Android (`?body=`).
 */
export function smsLink(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
