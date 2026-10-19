import { describe, expect, it } from 'vitest';

import { toSummaries, type ExpenseListRow } from './expenseList';

const row = (overrides: Partial<ExpenseListRow>): ExpenseListRow => ({
  id: 'e-costco',
  group_id: 'g-apartment',
  merchant: 'Costco',
  expense_date: '2026-10-17',
  total_cents: 14000,
  voided_at: null,
  created_at: '2026-10-17T20:00:00Z',
  replaces_expense_id: null,
  shares: [
    { amount_cents: 8300, participants: { user_id: 'u-leo' } },
    { amount_cents: 1500, participants: { user_id: 'u-jeff' } },
    { amount_cents: 4200, participants: { user_id: null } },
  ],
  ...overrides,
});

describe('toSummaries', () => {
  it('marks your share of the total, or the total when you’re not on it', () => {
    const [jeffs] = toSummaries([row({})], 'u-jeff');
    expect(jeffs).toMatchObject({ amountCents: 1500, totalCents: 14000, myShareCents: 1500 });
    const [sams] = toSummaries([row({})], 'u-sam');
    expect(sams).toMatchObject({ amountCents: 14000, myShareCents: null });
  });

  it('leaves out versions replaced by an edit, keeps voided ones, newest first', () => {
    const list = toSummaries(
      [
        row({ id: 'old', expense_date: '2026-10-10' }),
        row({ id: 'new', replaces_expense_id: 'old', expense_date: '2026-10-10' }),
        row({ id: 'void', voided_at: '2026-10-18T00:00:00Z', expense_date: '2026-10-12' }),
      ],
      'u-leo',
    );
    expect(list.map((e) => [e.id, e.voided])).toEqual([
      ['void', true],
      ['new', false],
    ]);
  });
});
