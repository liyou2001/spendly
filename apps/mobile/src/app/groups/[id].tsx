import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AddPersonForm,
  Avatar,
  Button,
  KeyBlock,
  ListRow,
  Loadable,
  Money,
  Screen,
  Section,
  Tag,
  Text,
  TextButton,
} from '@/components';
import { addPerson, fetchBalances, fetchExpenses, fetchGroup, friendlyError } from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { debtLabel } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

async function fetchGroupDetail(groupId: string) {
  const [group, balances, expenses] = await Promise.all([
    fetchGroup(groupId),
    fetchBalances(groupId),
    fetchExpenses({ groupId }),
  ]);
  return { group, balances, expenses };
}

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const detail = useLoad(useCallback(() => fetchGroupDetail(id), [id]));
  const [adding, setAdding] = useState(false);

  return (
    <Screen
      title={detail.status === 'ready' ? detail.data.group.name : ''}
      onBack={() => router.back()}
    >
      <Loadable load={detail} errorMessage="Couldn’t load this group.">
        {({ group, balances, expenses }) => {
          const me = group.people.find((p) => p.userId === userId)?.id ?? '';
          const nameOf = (participantId: string) =>
            participantId === me
              ? 'You'
              : (group.people.find((p) => p.id === participantId)?.displayName ?? 'Someone');

          return (
            <>
              <KeyBlock>
                {group.isPersonal ? (
                  <>
                    <Text variant="sectionHeading">Just you</Text>
                    <Text variant="body">
                      Expenses here are entirely yours and count fully in your budget.
                    </Text>
                  </>
                ) : balances.length === 0 ? (
                  // balances() only covers pairs that include you, so this can't speak for others.
                  <>
                    <Text variant="sectionHeading">You’re all settled</Text>
                    <Text variant="body">Nobody here owes you, and you don’t owe anyone.</Text>
                  </>
                ) : (
                  <View style={styles.stack}>
                    <Text variant="sectionHeading">Your balances</Text>
                    {balances.map((balance) => (
                      <View key={`${balance.from}-${balance.to}`} style={styles.balance}>
                        <Text variant="body" style={styles.flex}>
                          {debtLabel(balance, me, nameOf)}
                        </Text>
                        <Money cents={balance.amountCents} variant="bodyMedium" />
                      </View>
                    ))}
                  </View>
                )}
              </KeyBlock>

              <Button
                label="Add expense"
                onPress={() =>
                  router.push({ pathname: '/add-expense', params: { groupId: group.id } })
                }
              />

              <Section title="Expenses">
                {expenses.length === 0 ? (
                  <Text variant="small">No expenses yet.</Text>
                ) : (
                  <View>
                    {expenses.map((expense, index) => (
                      <ListRow
                        key={expense.id}
                        title={expense.merchant}
                        subtitle={
                          expense.view === 'share'
                            ? `${formatDate(expense.expenseDate)} · your share`
                            : formatDate(expense.expenseDate)
                        }
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
                )}
              </Section>

              <Section title="People">
                <View>
                  {group.people.map((person, index) => (
                    <ListRow
                      key={person.id}
                      title={
                        person.userId === userId
                          ? `${person.displayName} (you)`
                          : person.displayName
                      }
                      subtitle={person.phone ?? (person.userId ? 'Has the app' : 'No phone number')}
                      leading={<Avatar name={person.displayName} size={36} />}
                      {...(person.userId === userId
                        ? { trailing: <Tag label="You" tone="accent" /> }
                        : {})}
                      divider={index < group.people.length - 1}
                    />
                  ))}
                </View>
                {group.isPersonal ? null : adding ? (
                  <AddPersonForm
                    onCancel={() => setAdding(false)}
                    onAdd={async (displayName, phone) => {
                      try {
                        await addPerson(group.id, displayName, phone);
                      } catch (e) {
                        throw new Error(friendlyError(e as Error));
                      }
                      setAdding(false);
                      detail.reload();
                    }}
                  />
                ) : (
                  <TextButton label="Add person" icon="user-plus" onPress={() => setAdding(true)} />
                )}
              </Section>
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.sm,
  },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
});
