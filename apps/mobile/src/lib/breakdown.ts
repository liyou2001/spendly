// "How your $15.00 was worked out": a share explained line by line, from the ledger's
// shareBreakdown (which adds up exactly to the share). Pure, so it's unit tested.
import { formatCents, shareBreakdown, type Cents, type ExpenseLine } from '@spendly/ledger';

import { itemTitle } from './labels';

/** A saved line of an expense, as the expense screen has it. */
export interface BillLine {
  name: string;
  amountCents: Cents;
  kind: string;
  quantity: number;
  participantIds: string[];
  /** Matching participantIds. */
  units: number[];
  /** Tagged one by one; otherwise split evenly. */
  byUnits: boolean;
}

export interface ExplainedRow {
  title: string;
  /** How the line was split, e.g. "$22.99 split 3 ways" or "2 of 3". */
  detail: string | null;
  cents: Cents;
}

export interface Explained {
  items: ExplainedRow[];
  itemsCents: Cents;
  /** "10.7%": the person's items as a share of all items, which tax, tip and discounts follow. */
  percentOfItems: string;
  adjustments: ExplainedRow[];
  totalCents: Cents;
}

/** The expense's lines as the ledger takes them. */
export function ledgerLines(lines: readonly BillLine[]): ExpenseLine[] {
  return lines.map((line) =>
    line.kind === 'item'
      ? {
          kind: 'item',
          amountCents: line.amountCents,
          participantIds: line.participantIds,
          ...(line.byUnits ? { units: line.units } : {}),
        }
      : { kind: line.kind as 'tax' | 'tip' | 'discount', amountCents: line.amountCents },
  );
}

/** "10.7%" from 0.10714. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/**
 * One person's share, line by line. null when the expense has no items (a total split by
 * amount), the person isn't on it, or it doesn't come to their saved share (`savedCents`), so
 * a breakdown never shows a different total from the one above it.
 */
export function explainShare(
  lines: readonly BillLine[],
  participantId: string,
  savedCents?: Cents,
): Explained | null {
  if (!lines.some((line) => line.kind === 'item')) return null;
  let breakdown;
  try {
    breakdown = shareBreakdown({ lines: ledgerLines(lines) }, participantId);
  } catch {
    return null;
  }
  if (breakdown.items.length === 0) return null;
  if (savedCents !== undefined && breakdown.totalCents !== savedCents) return null;

  const items = breakdown.items.map(({ lineIndex, cents }) => {
    const line = lines[lineIndex];
    if (!line) return { title: 'Item', detail: null, cents };
    const people = line.participantIds.length;
    const units = line.units[line.participantIds.indexOf(participantId)] ?? 1;
    const detail = line.byUnits
      ? `${units} of ${line.quantity} · ${formatCents(line.amountCents)} for all`
      : people > 1
        ? `${formatCents(line.amountCents)} split ${people} ways`
        : null;
    return { title: itemTitle(line.name, line.quantity), detail, cents };
  });

  const percent = formatPercent(breakdown.percentOfItems);
  const adjustments = breakdown.adjustments.map(({ lineIndex, cents }) => {
    const line = lines[lineIndex];
    const amount = Math.abs(line?.amountCents ?? 0);
    return {
      title: line?.name ?? 'Adjustment',
      detail: `${percent} of ${formatCents(amount)}`,
      cents,
    };
  });

  return {
    items,
    itemsCents: breakdown.itemsCents,
    percentOfItems: percent,
    adjustments,
    totalCents: breakdown.totalCents,
  };
}
