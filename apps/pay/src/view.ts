// What the page shows, worked out from the get-share response. Pure, so it's unit tested.
import { formatCents, shareBreakdown, type ExpenseLine } from '@spendly/ledger';

import type { BillItem, ShareExpense, SharePage } from './api';

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

/** "3 × Soft drink" for more than one, otherwise just the name. */
export function itemTitle(item: Pick<BillItem, 'name' | 'quantity'>): string {
  return item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name;
}

/**
 * Who an item was for: "Leo", "Jeff and Maya", "Jeff 2, Maya 1", or "All 3" when it was for
 * everyone on this bill (who may not be the whole group).
 */
export function whoFor(item: BillItem, expense: Pick<ShareExpense, 'people'>): string {
  const nameOf = (ref: string) => expense.people.find((p) => p.ref === ref)?.name ?? 'Someone';
  if (item.by_units) return item.people.map((p) => `${nameOf(p.ref)} ${p.units}`).join(', ');
  if (item.people.length > 2 && item.people.length === expense.people.length) {
    return `All ${item.people.length}`;
  }
  const names = item.people.map((p) => nameOf(p.ref));
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export interface ExplainedRow {
  title: string;
  detail: string | null;
  cents: number;
}

/**
 * "How your $15.00 was worked out": the link holder's share, line by line, from the ledger. It
 * adds up exactly to their share. null for an expense split by amount (no items).
 */
export function explainYours(expense: ShareExpense): {
  items: ExplainedRow[];
  itemsCents: number;
  percent: string;
  adjustments: ExplainedRow[];
  totalCents: number;
} | null {
  const you = expense.people.find((p) => p.you)?.ref;
  if (!you || !expense.items.some((i) => i.kind === 'item')) return null;
  const lines: ExpenseLine[] = expense.items.map((item) =>
    item.kind === 'item'
      ? {
          kind: 'item',
          amountCents: item.amount_cents,
          participantIds: item.people.map((p) => p.ref),
          ...(item.by_units ? { units: item.people.map((p) => p.units) } : {}),
        }
      : { kind: item.kind, amountCents: item.amount_cents },
  );
  let breakdown;
  try {
    breakdown = shareBreakdown({ lines }, you);
  } catch {
    return null;
  }
  const percent = `${Math.round(breakdown.percentOfItems * 1000) / 10}%`;
  return {
    items: breakdown.items.map(({ lineIndex, cents }) => {
      const item = expense.items[lineIndex];
      const mine = item?.people.find((p) => p.ref === you);
      const detail = !item
        ? null
        : item.by_units
          ? `${mine?.units ?? 1} of ${item.quantity} · ${formatCents(item.amount_cents)} for all`
          : item.people.length > 1
            ? `${formatCents(item.amount_cents)} split ${item.people.length} ways`
            : null;
      return { title: item ? itemTitle(item) : 'Item', detail, cents };
    }),
    itemsCents: breakdown.itemsCents,
    percent,
    adjustments: breakdown.adjustments.map(({ lineIndex, cents }) => {
      const item = expense.items[lineIndex];
      return {
        title: item?.name ?? 'Adjustment',
        detail: `${percent} of ${formatCents(Math.abs(item?.amount_cents ?? 0))}`,
        cents,
      };
    }),
    totalCents: breakdown.totalCents,
  };
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
