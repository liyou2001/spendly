// The Budget screen's math: which budget applies in a month, what you've spent against it, and
// notes where splitting changed a number. Pure, so it's unit tested (Rule 10).
import { formatCents, type Cents } from '@spendly/ledger';

/** A budget row: from `month` on, until a later row for the same category. null = no budget. */
export interface BudgetRow {
  categoryId: string;
  /** First of the month, YYYY-MM-01. */
  month: string;
  amountCents: Cents | null;
}

/** One thing that counts as your spending: your share of an expense, or a debt you forgave. */
export interface SpendingItem {
  /** Unique per item: the expense for a share, the payment for a forgiven debt. */
  itemId: string;
  expenseId: string;
  merchant: string;
  expenseDate: string;
  /** Your category for it; null when uncategorized. */
  categoryId: string | null;
  amountCents: Cents;
  /** The expense's total, only when you paid or entered it. */
  totalCents: Cents | null;
  paidByName: string;
  youPaid: boolean;
  isForgiveness: boolean;
}

export interface BudgetLine {
  /** null for the Uncategorized line. */
  categoryId: string | null;
  name: string;
  spentCents: Cents;
  budgetCents: Cents | null;
  /** E.g. "Includes your $83 share of the $140 Costco trip". */
  note: string | null;
}

export interface BudgetView {
  month: string;
  /** Everything you spent, budgeted or not. */
  spentCents: Cents;
  /** The sum of this month's budgets; null when no category has one. */
  budgetCents: Cents | null;
  /** Spent in categories that have a budget, which is what the budget is measured against. */
  budgetedSpentCents: Cents;
  /** Budget minus budgeted spending; negative when over. null without a budget. */
  leftCents: Cents | null;
  /** Days left including today, for the current month only. */
  daysLeft: number | null;
  lines: BudgetLine[];
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-10-19" -> "2026-10-01". */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** "2026-12-01" + 1 -> "2027-01-01". */
export function addMonths(month: string, count: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = (year ?? 1970) * 12 + ((m ?? 1) - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${year}`;
}

/** Days left in `month` counting today, or null when `today` isn't in that month. */
export function daysLeftInMonth(today: string, month: string): number | null {
  if (monthStart(today) !== month) return null;
  const [year, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year ?? 1970, m ?? 1, 0)).getUTCDate();
  return daysInMonth - Number(today.slice(8, 10)) + 1;
}

/** The budget in effect for a category in a month: the latest row on or before it. */
export function effectiveBudget(
  rows: readonly BudgetRow[],
  categoryId: string,
  month: string,
): Cents | null {
  const latest = rows
    .filter((r) => r.categoryId === categoryId && r.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest?.amountCents ?? null;
}

/** "$83" for whole dollars, "$83.50" otherwise. */
export function shortMoney(cents: Cents): string {
  return cents % 100 === 0 ? formatCents(cents).slice(0, -3) : formatCents(cents);
}

/** Why a category's number isn't simply what you paid, or null if nothing to explain. */
export function splitNote(items: readonly SpendingItem[]): string | null {
  const split = items.filter(
    (i) =>
      !i.isForgiveness && (!i.youPaid || (i.totalCents !== null && i.totalCents > i.amountCents)),
  );
  const forgiven = items.filter((i) => i.isForgiveness).reduce((sum, i) => sum + i.amountCents, 0);

  let note: string | null = null;
  const [only] = split;
  if (split.length === 1 && only) {
    note =
      only.youPaid && only.totalCents !== null
        ? `Includes your ${shortMoney(only.amountCents)} share of the ${shortMoney(only.totalCents)} ${only.merchant} trip`
        : `Includes your ${shortMoney(only.amountCents)} share of ${only.paidByName}’s ${only.merchant} trip`;
  } else if (split.length > 1) {
    note = `Includes your shares of ${split.length} split purchases`;
  }
  if (forgiven > 0) {
    const part = `${shortMoney(forgiven)} you forgave`;
    note = note ? `${note}, plus ${part}` : `Includes ${part}`;
  }
  return note;
}

/** The Budget screen for a month: totals, one line per category in use, and Uncategorized last. */
export function buildBudgetView(input: {
  month: string;
  today: string;
  categories: readonly { id: string; name: string }[];
  budgets: readonly BudgetRow[];
  items: readonly SpendingItem[];
}): BudgetView {
  const lines: BudgetLine[] = [];
  let budgetTotal: Cents | null = null;
  let budgetedSpent: Cents = 0;

  for (const category of input.categories) {
    const items = input.items.filter((i) => i.categoryId === category.id);
    const spent = items.reduce((sum, i) => sum + i.amountCents, 0);
    const budget = effectiveBudget(input.budgets, category.id, input.month);
    if (budget !== null) {
      budgetTotal = (budgetTotal ?? 0) + budget;
      budgetedSpent += spent;
    }
    if (spent > 0 || budget !== null) {
      lines.push({
        categoryId: category.id,
        name: category.name,
        spentCents: spent,
        budgetCents: budget,
        note: splitNote(items),
      });
    }
  }

  const known = new Set(input.categories.map((c) => c.id));
  const loose = input.items.filter((i) => i.categoryId === null || !known.has(i.categoryId));
  if (loose.length > 0) {
    lines.push({
      categoryId: null,
      name: 'Uncategorized',
      spentCents: loose.reduce((sum, i) => sum + i.amountCents, 0),
      budgetCents: null,
      note: splitNote(loose),
    });
  }

  const spentCents = input.items.reduce((sum, i) => sum + i.amountCents, 0);
  return {
    month: input.month,
    spentCents,
    budgetCents: budgetTotal,
    budgetedSpentCents: budgetedSpent,
    leftCents: budgetTotal === null ? null : budgetTotal - budgetedSpent,
    daysLeft: daysLeftInMonth(input.today, input.month),
    lines,
  };
}
