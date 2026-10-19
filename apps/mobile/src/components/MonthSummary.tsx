import { formatCents } from '@spendly/ledger';

import { monthLabel, type BudgetView } from '@/lib/budget';

import { KeyBlock } from './KeyBlock';
import { Money } from './Money';
import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

/** The month's key block: spent so far, against the budget, and what's left with days to go. */
export function MonthSummary({ view }: { view: BudgetView }) {
  const { spentCents, budgetCents, budgetedSpentCents, leftCents, daysLeft } = view;
  const days = daysLeft === null ? '' : ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go`;

  return (
    <KeyBlock>
      <Text variant="sectionHeading">Spent in {monthLabel(view.month).split(' ')[0]}</Text>
      <Money cents={spentCents} variant="bigNumber" />
      {budgetCents !== null && leftCents !== null ? (
        <>
          <ProgressBar
            value={budgetedSpentCents}
            max={budgetCents}
            accessibilityLabel={`${formatCents(budgetedSpentCents)} of ${formatCents(budgetCents)} budget`}
          />
          <Text variant="body">
            {leftCents >= 0
              ? `${formatCents(leftCents)} left of ${formatCents(budgetCents)}${days}`
              : `${formatCents(-leftCents)} over your ${formatCents(budgetCents)} budget${days}`}
          </Text>
          {budgetedSpentCents !== spentCents ? (
            <Text variant="small">
              {formatCents(spentCents - budgetedSpentCents)} was in categories without a budget.
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="small">No budgets yet. Set one for a category on the Budget tab.</Text>
      )}
    </KeyBlock>
  );
}
