/** An amount of money as a whole number of cents (Rule 1). Never a float. */
export type Cents = number;

/** A participant in a group. May or may not have an account. */
export type ParticipantId = string;

/** One participant's part of an amount. */
export interface Share {
  participantId: ParticipantId;
  amountCents: Cents;
}

/**
 * A receipt line that belongs to specific people. Split equally among `participantIds`, or in
 * proportion to `units` when given: one whole number per person, e.g. Jeff 2 and Maya 1 of
 * "3 × Soft drink".
 */
export interface ItemLine {
  kind: 'item';
  amountCents: Cents;
  participantIds: readonly ParticipantId[];
  units?: readonly number[];
}

/**
 * A line split in proportion to each person's item subtotal.
 * Tax and tip are positive; discounts are negative, as stored in `expense_items`.
 */
export interface AdjustmentLine {
  kind: 'tax' | 'tip' | 'discount';
  amountCents: Cents;
}

export type ExpenseLine = ItemLine | AdjustmentLine;

export interface ComputedShares {
  totalCents: Cents;
  /** Sorted by participant id. Sums exactly to `totalCents`. */
  shares: Share[];
}

export interface ExpenseShare extends Share {
  /** The participant's own category for this share, if they picked one. */
  categoryOverrideId?: string | null;
}

/** A saved expense, as the ledger needs it for balances and spending. */
export interface LedgerExpense {
  id: string;
  paidBy: ParticipantId;
  /** Calendar date of the purchase, `YYYY-MM-DD`. */
  expenseDate: string;
  /** The payer's category. */
  categoryId: string | null;
  shares: readonly ExpenseShare[];
  voidedAt?: string | null;
}

export type PaymentStatus = 'claimed' | 'confirmed' | 'rejected';

interface PaymentBase {
  /** The person who owed the money. */
  from: ParticipantId;
  /** The person who was owed. */
  to: ParticipantId;
  amountCents: Cents;
  status: PaymentStatus;
}

/** Money paid back. Never counts as income or spending (Rule 7). */
export interface Repayment extends PaymentBase {
  kind: 'payment';
}

/**
 * `to` forgives part of what `from` owes for one expense.
 * The forgiven amount becomes `to`'s own spending in that expense's category.
 */
export interface Forgiveness extends PaymentBase {
  kind: 'forgiveness';
  expenseId: string;
}

export type LedgerPayment = Repayment | Forgiveness;

/** `from` owes `to` `amountCents`. */
export interface Debt {
  from: ParticipantId;
  to: ParticipantId;
  amountCents: Cents;
}

export interface CategorySpending {
  /** First day of the month, `YYYY-MM-01`, matching `budgets.month`. */
  month: string;
  /** `null` when the share has no category for this user. */
  categoryId: string | null;
  amountCents: Cents;
}
