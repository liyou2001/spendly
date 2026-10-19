import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { KeyBlock, ListRow, Loadable, Money, Screen, Section, Tag, Text } from '@/components';
import { fetchExpenses, fetchGroups } from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { useLoad } from '@/lib/useLoad';

async function fetchRecent() {
  const [expenses, groups] = await Promise.all([fetchExpenses({ limit: 10 }), fetchGroups()]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return { expenses, groupNames };
}

// The month summary and "Needs you" arrive in Step 7. For now: your most recent expenses.
export default function Home() {
  const recent = useLoad(useCallback(() => fetchRecent(), []));

  return (
    <Screen title="Home">
      <KeyBlock>
        <Text variant="sectionHeading">This month</Text>
        <Text variant="body">Your spending and what people owe you will show up here.</Text>
      </KeyBlock>
      <Section title="Recent">
        <Loadable load={recent} errorMessage="Couldn’t load your expenses.">
          {({ expenses, groupNames }) =>
            expenses.length === 0 ? (
              <Text variant="small">No expenses yet. Tap + to add one.</Text>
            ) : (
              <View>
                {expenses.map((expense, index) => (
                  <ListRow
                    key={expense.id}
                    title={expense.merchant}
                    subtitle={[
                      formatDate(expense.expenseDate),
                      groupNames[expense.groupId],
                      expense.view === 'share' ? 'your share' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      expense.voided ? (
                        <Tag label="Voided" />
                      ) : (
                        <Money cents={expense.amountCents} variant="bodyMedium" />
                      )
                    }
                    onPress={() =>
                      router.push({ pathname: '/expenses/[id]', params: { id: expense.id } })
                    }
                    divider={index < expenses.length - 1}
                  />
                ))}
              </View>
            )
          }
        </Loadable>
      </Section>
    </Screen>
  );
}
