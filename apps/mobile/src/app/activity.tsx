import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { ListRow, Loadable, Money, Screen, Text } from '@/components';
import { monthLabel, monthStart } from '@/lib/budget';
import { fetchCategories, fetchSpendingItems } from '@/lib/data';
import { formatDate, todayLocal } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';

/** Everything that counted as your spending in a month, newest first. */
export default function Activity() {
  const params = useLocalSearchParams<{ month?: string; filter?: string }>();
  const month = params.month ?? monthStart(todayLocal());
  const onlyUncategorized = params.filter === 'uncategorized';
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const data = useLoad(
    useCallback(async () => {
      const [items, categories] = await Promise.all([
        fetchSpendingItems(month),
        fetchCategories(userId),
      ]);
      return { items, names: Object.fromEntries(categories.map((c) => [c.id, c.name])) };
    }, [userId, month]),
  );

  return (
    <Screen
      title={onlyUncategorized ? 'Uncategorized' : `Activity · ${monthLabel(month)}`}
      onBack={() => router.back()}
    >
      {onlyUncategorized ? (
        <Text variant="small">
          Your shares of other people’s expenses. Open one to file it under one of your categories.
        </Text>
      ) : null}
      <Loadable load={data} errorMessage="Couldn’t load your activity.">
        {({ items, names }) => {
          const shown = onlyUncategorized
            ? items.filter((i) => i.categoryId === null || !names[i.categoryId])
            : items;
          if (shown.length === 0) {
            return <Text variant="small">Nothing here for {monthLabel(month)}.</Text>;
          }
          return (
            <View>
              {shown.map((item, index) => (
                <ListRow
                  key={item.itemId}
                  title={item.merchant}
                  subtitle={[
                    formatDate(item.expenseDate),
                    (item.categoryId && names[item.categoryId]) ?? 'Uncategorized',
                    item.isForgiveness
                      ? 'you forgave'
                      : item.youPaid
                        ? item.totalCents !== null && item.totalCents > item.amountCents
                          ? 'your share'
                          : null
                        : `your share · ${item.paidByName} paid`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={<Money cents={item.amountCents} variant="bodyMedium" />}
                  onPress={() =>
                    router.push({ pathname: '/expenses/[id]', params: { id: item.expenseId } })
                  }
                  divider={index < shown.length - 1}
                />
              ))}
            </View>
          );
        }}
      </Loadable>
    </Screen>
  );
}
