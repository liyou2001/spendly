import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, View } from 'react-native';

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
  TextField,
} from '@/components';
import {
  addPerson,
  fetchBalances,
  fetchExpenses,
  fetchGroup,
  friendlyError,
  renameGroup,
} from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { debtLabel, expenseListNote } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { colors, space } from '@/theme';

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
              {group.isOneOff ? (
                <OneOffHeader groupId={group.id} name={group.name} onRenamed={detail.reload} />
              ) : null}
              <KeyBlock>
                {group.isPersonal ? (
                  <>
                    <Text variant="sectionHeading">Just you</Text>
                    <Text variant="body">
                      Expenses here are entirely yours and count fully in your budget.
                    </Text>
                  </>
                ) : balances.length === 0 ? (
                  <>
                    <Text variant="sectionHeading">Everyone’s settled up</Text>
                    <Text variant="body">Nobody in this group owes anyone.</Text>
                  </>
                ) : (
                  // Groups are transparent: every pair, yours first.
                  <View style={styles.stack}>
                    <Text variant="sectionHeading">Who owes whom</Text>
                    {[...balances]
                      .sort(
                        (a, b) =>
                          Number(b.from === me || b.to === me) -
                          Number(a.from === me || a.to === me),
                      )
                      .map((balance) => {
                        const mine = balance.from === me || balance.to === me;
                        const other = balance.from === me ? balance.to : balance.from;
                        return mine ? (
                          <Pressable
                            key={`${balance.from}-${balance.to}`}
                            onPress={() =>
                              router.push({ pathname: '/people/[id]', params: { id: other } })
                            }
                            accessibilityRole="button"
                            style={({ pressed }) => [styles.balance, pressed && styles.pressed]}
                          >
                            <Text variant="body" style={styles.flex}>
                              {debtLabel(balance, me, nameOf)}
                            </Text>
                            <Money cents={balance.amountCents} variant="bodyMedium" />
                            <Feather name="chevron-right" size={18} color={colors.muted} />
                          </Pressable>
                        ) : (
                          <View key={`${balance.from}-${balance.to}`} style={styles.balance}>
                            <Text variant="body" style={styles.flex}>
                              {debtLabel(balance, me, nameOf)}
                            </Text>
                            <Money cents={balance.amountCents} variant="bodyMedium" />
                            <View style={styles.chevronSpace} />
                          </View>
                        );
                      })}
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
                        subtitle={[formatDate(expense.expenseDate), expenseListNote(expense)]
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
                      subtitle={
                        person.userId
                          ? person.username
                            ? `@${person.username}`
                            : 'Has the app'
                          : person.invite
                            ? `Invited${person.invite.username ? ` @${person.invite.username}` : ''}`
                            : (person.phone ?? 'No phone number')
                      }
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
                    onAdd={async (displayName, phone, inviteUserId) => {
                      try {
                        await addPerson(group.id, displayName, phone, inviteUserId);
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

/** "Quick split" tag and renaming, for a quick split whose automatic name doesn't fit. */
function OneOffHeader({
  groupId,
  name,
  onRenamed,
}: {
  groupId: string;
  name: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = text.trim();
    if (!next) {
      setError('Give it a name.');
      return;
    }
    setSaving(true);
    try {
      await renameGroup(groupId, next);
      setEditing(false);
      onRenamed();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <View style={styles.oneOff}>
        <Tag label="Quick split" />
        <TextButton
          label="Rename"
          icon="edit-2"
          onPress={() => {
            setText(name);
            setError(null);
            setEditing(true);
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <TextField
        label="Name"
        value={text}
        onChangeText={(next) => {
          setText(next);
          setError(null);
        }}
        error={error}
        maxLength={80}
        autoFocus
      />
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
        </View>
        <View style={styles.flex}>
          <Button label="Save" onPress={() => void save()} loading={saving} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chevronSpace: {
    width: 18,
  },
  oneOff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  stack: {
    gap: space.sm,
  },
  balance: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  pressed: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
  },
});
