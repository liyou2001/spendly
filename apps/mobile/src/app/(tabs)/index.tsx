import { formatCents } from '@spendly/ledger';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  KeyBlock,
  ListRow,
  Loadable,
  Money,
  MonthSummary,
  Screen,
  Section,
  Tag,
  Text,
} from '@/components';
import { monthStart } from '@/lib/budget';
import { fetchMonth } from '@/lib/budgetData';
import {
  fetchBalances,
  fetchExpenses,
  fetchGroups,
  fetchPayments,
  fetchProblemReports,
  fetchProfile,
} from '@/lib/data';
import { formatDate, todayLocal } from '@/lib/dates';
import { useInvites } from '@/lib/invites';
import { expenseListNote } from '@/lib/labels';
import { buildPeopleView } from '@/lib/people';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { colors, radius } from '@/theme';

async function fetchSummary(userId: string) {
  const [month, groups, latest] = await Promise.all([
    fetchMonth(userId, monthStart(todayLocal())),
    fetchGroups(),
    fetchExpenses({ limit: 1 }),
  ]);
  return { view: month.view, firstRun: !groups.some((g) => !g.isPersonal) && latest.length === 0 };
}

async function fetchPeople(userId: string) {
  const [groups, balances, payments, reports] = await Promise.all([
    fetchGroups(),
    fetchBalances(),
    fetchPayments({ status: 'claimed' }),
    fetchProblemReports(),
  ]);
  const people = new Map(
    groups.flatMap((g) => g.people.map((p) => [p.id, { name: p.displayName, groupName: g.name }])),
  );
  return {
    ...buildPeopleView({ userId, groups, balances, payments, now: new Date() }),
    notes: reports.map((report) => ({
      report,
      name: people.get(report.from)?.name ?? 'Someone',
      groupName: people.get(report.from)?.groupName ?? '',
    })),
  };
}

async function fetchRecent() {
  const [recent, groups] = await Promise.all([fetchExpenses({ limit: 10 }), fetchGroups()]);
  return { recent, groupNames: Object.fromEntries(groups.map((g) => [g.id, g.name])) };
}

export default function Home() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const profile = useLoad(useCallback(() => fetchProfile(userId), [userId]));
  const summary = useLoad(useCallback(() => fetchSummary(userId), [userId]));
  const people = useLoad(useCallback(() => fetchPeople(userId), [userId]));
  const recent = useLoad(useCallback(() => fetchRecent(), []));
  const { invites, refresh: refreshInvites } = useInvites();
  useFocusEffect(useCallback(() => refreshInvites(), [refreshInvites]));

  const firstName =
    profile.status === 'ready'
      ? (profile.data.display_name.split(' ')[0] ?? profile.data.display_name)
      : null;
  const firstRun = summary.status === 'ready' && summary.data.firstRun;
  const claims =
    people.status === 'ready'
      ? people.data.groups.flatMap((g) =>
          g.people.flatMap((person) => person.claimsToMe.map((claim) => ({ claim, person }))),
        )
      : [];
  const notes = people.status === 'ready' ? people.data.notes : [];

  return (
    <Screen title={firstName ? `Hi, ${firstName}` : 'Home'}>
      <Loadable load={summary} errorMessage="Couldn’t load this month’s spending.">
        {({ view }) =>
          firstRun ? (
            <KeyBlock>
              <Text variant="sectionHeading">Add your first shared expense</Text>
              <Text variant="body">
                Split a receipt with roommates or friends. Your share counts in your budget, and
                what they owe you is tracked separately.
              </Text>
              <Button label="Add an expense" onPress={() => router.push('/add-expense')} />
              <Button
                label="Make a group"
                variant="secondary"
                onPress={() => router.push('/groups/new')}
              />
            </KeyBlock>
          ) : (
            <Pressable
              onPress={() => router.push('/budget')}
              accessibilityRole="button"
              accessibilityHint="Opens your budget"
            >
              <MonthSummary view={view} />
            </Pressable>
          )
        }
      </Loadable>

      {firstRun ? null : (
        <Loadable load={people} errorMessage="Couldn’t load what’s owed.">
          {({ owedToMeCents, iOweCents }) => (
            <View>
              <ListRow
                title="Owed to you"
                trailing={<Money cents={owedToMeCents} variant="bodyMedium" />}
                onPress={() => router.push('/people')}
              />
              <ListRow
                title="You owe"
                trailing={<Money cents={iOweCents} variant="bodyMedium" />}
                onPress={() => router.push('/people')}
                divider={false}
              />
            </View>
          )}
        </Loadable>
      )}

      {claims.length > 0 || notes.length > 0 || invites.length > 0 ? (
        <Section title="Needs you">
          <View>
            {claims.map(({ claim, person }, index) => (
              <ListRow
                key={claim.id}
                title={`${person.name} says they paid ${formatCents(claim.amountCents)}`}
                subtitle={`${person.groupName} · tap to confirm`}
                trailing={<View style={styles.dot} />}
                onPress={() =>
                  router.push({ pathname: '/people/[id]', params: { id: person.participantId } })
                }
                divider={index < claims.length - 1 || notes.length > 0 || invites.length > 0}
              />
            ))}
            {notes.map(({ report, name, groupName }, index) => (
              <ListRow
                key={report.id}
                title={`${name}: “${report.message}”`}
                subtitle={[groupName, 'something looks wrong'].filter(Boolean).join(' · ')}
                trailing={<View style={styles.dot} />}
                onPress={() =>
                  router.push({ pathname: '/people/[id]', params: { id: report.from } })
                }
                divider={index < notes.length - 1 || invites.length > 0}
              />
            ))}
            {invites.length > 0 ? (
              <ListRow
                title={
                  invites.length === 1
                    ? `${invites[0]?.invitedByName} invited you to ${invites[0]?.groupName}`
                    : `${invites.length} invites to groups`
                }
                subtitle="Accept to see your share in your app"
                trailing={<View style={styles.dot} />}
                onPress={() => router.push(invites.length === 1 ? '/people' : '/invites')}
                divider={false}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section title="Recent">
        <Loadable load={recent} errorMessage="Couldn’t load recent expenses.">
          {({ recent: expenses, groupNames }) =>
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
                      expenseListNote(expense),
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

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
