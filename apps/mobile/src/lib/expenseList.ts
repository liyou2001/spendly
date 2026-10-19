// Expense lists (Home, a group): every expense in your groups, with your share marked. Pure, so
// it's unit tested.
import type { Cents } from '@spendly/ledger';

export interface ExpenseSummary {
  id: string;
  groupId: string;
  merchant: string;
  expenseDate: string;
  createdAt: string;
  voided: boolean;
  /** Your share if you're on it, otherwise the total. */
  amountCents: Cents;
  totalCents: Cents;
  /** Your share, or null when you're not on this expense. */
  myShareCents: Cents | null;
}

/** An expenses row as the list query returns it. */
export interface ExpenseListRow {
  id: string;
  group_id: string;
  merchant: string;
  expense_date: string;
  total_cents: Cents;
  voided_at: string | null;
  created_at: string;
  replaces_expense_id: string | null;
  shares: { amount_cents: Cents; participants: { user_id: string | null } | null }[];
}

/**
 * The rows as list entries, newest first. Earlier versions replaced by an edit are left out
 * (the edit stands in for them); voided ones stay, marked.
 */
export function toSummaries(
  rows: readonly ExpenseListRow[],
  userId: string | undefined,
): ExpenseSummary[] {
  const replaced = new Set(rows.map((row) => row.replaces_expense_id).filter(Boolean));
  return rows
    .filter((row) => !replaced.has(row.id))
    .map((row) => {
      const myShare =
        row.shares.find((s) => userId && s.participants?.user_id === userId)?.amount_cents ?? null;
      return {
        id: row.id,
        groupId: row.group_id,
        merchant: row.merchant,
        expenseDate: row.expense_date,
        createdAt: row.created_at,
        voided: row.voided_at !== null,
        amountCents: myShare ?? row.total_cents,
        totalCents: row.total_cents,
        myShareCents: myShare,
      };
    })
    .sort(
      (a, b) =>
        b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt),
    );
}
