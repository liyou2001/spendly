// What the page shows, worked out from the get-share response. Pure, so it's unit tested.
import type { ShareExpense, ShareItem, SharePage } from './api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The link token from the URL's #fragment (never sent to the server hosting the page). */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, '');
  return /^[A-Za-z0-9_-]{32}$/.test(token) ? token : null;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** What's left to pay once claims waiting to be confirmed are counted. */
export function amountDue(page: Pick<SharePage, 'owed_cents' | 'pending_cents'>): number {
  return Math.max(page.owed_cents - page.pending_cents, 0);
}

/** "Oct 17" from "2026-10-17". */
export function formatDay(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}`;
}

/** "Split 3 ways" for a shared item, null for one that was all theirs. */
export function itemNote(item: ShareItem): string | null {
  return item.split_count > 1 ? `Split ${item.split_count} ways` : null;
}

/** A vague note for the payment app, which may show it in a feed: "Costco 10/17". */
export function paymentNote(expenses: readonly ShareExpense[]): string {
  const [first] = expenses;
  if (!first) return 'Spendly';
  if (expenses.length > 1) return `${first.merchant} + ${expenses.length - 1} more`;
  const [, month, day] = first.expense_date.split('-').map(Number);
  return `${first.merchant} ${month}/${day}`;
}

/** A Zelle contact as people read it: "(608) 555-0123" for a US number, emails as they are. */
export function formatZelle(contact: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(contact);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : contact;
}
