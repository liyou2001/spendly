import { formatCents } from '@spendly/ledger';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AmountForm,
  Chip,
  FormMessage,
  IconButton,
  ListRow,
  Loadable,
  Money,
  MonthSummary,
  ProgressBar,
  Screen,
  Section,
  Text,
  TextButton,
} from '@/components';
import { addMonths, monthLabel, monthStart, type BudgetLine } from '@/lib/budget';
import { fetchMonth } from '@/lib/budgetData';
import { fetchBalances, fetchGroups, friendlyError, setBudget } from '@/lib/data';
import { todayLocal } from '@/lib/dates';
import { buildPeopleView } from '@/lib/people';
import { useSession } from '@/lib/session';
import { useLoad } from '@/lib/useLoad';
import { colors, space } from '@/theme';

async function fetchOwed(userId: string) {
  const [groups, balances] = await Promise.all([fetchGroups(), fetchBalances()]);
  return buildPeopleView({ userId, groups, balances, payments: [], now: new Date() });
}

export default function Budget() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const thisMonth = monthStart(todayLocal());
  const [month, setMonth] = useState(thisMonth);
  const owed = useLoad(useCallback(() => fetchOwed(userId), [userId]));

  return (
    <Screen title="Budget">
      <View style={styles.monthRow}>
        <IconButton
          icon="chevron-left"
          label="Previous month"
          onPress={() => setMonth(addMonths(month, -1))}
        />
        <Text variant="bodyMedium" style={styles.monthLabel}>
          {monthLabel(month)}
        </Text>
        {month < thisMonth ? (
          <IconButton
            icon="chevron-right"
            label="Next month"
            onPress={() => setMonth(addMonths(month, 1))}
          />
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>

      <MonthBudget key={month} userId={userId} month={month} />

      <Section
        title="Not counted as spending"
        description="Money owed between you and others. Paying it back is never spending or income."
      >
        <Loadable load={owed} errorMessage="Couldn’t load what’s owed.">
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
      </Section>

      <TextButton
        label={`All activity in ${monthLabel(month).split(' ')[0]}`}
        icon="list"
        onPress={() => router.push({ pathname: '/activity', params: { month } })}
      />
    </Screen>
  );
}

/** One month's summary and categories. Keyed by month, so switching months starts fresh. */
function MonthBudget({ userId, month }: { userId: string; month: string }) {
  const data = useLoad(useCallback(() => fetchMonth(userId, month), [userId, month]));
  // Which category's budget is being edited: its id, or "pick" to choose one first.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Loadable load={data} errorMessage="Couldn’t load your budget.">
      {({ view, categories }) => {
        const unbudgeted = categories.filter(
          (c) => !view.lines.some((l) => l.categoryId === c.id && l.budgetCents !== null),
        );
        const saveBudget = async (categoryId: string, cents: number | null) => {
          try {
            await setBudget(categoryId, month, cents);
          } catch (e) {
            throw new Error(friendlyError(e as Error));
          }
          setEditing(null);
          data.reload();
        };

        return (
          <>
            <MonthSummary view={view} />

            <Section title="Categories">
              {view.lines.length === 0 ? (
                <Text variant="small">Nothing spent in {monthLabel(month)} yet.</Text>
              ) : (
                <View>
                  {view.lines.map((line, index) =>
                    line.categoryId !== null && editing === line.categoryId ? (
                      <BudgetEditor
                        key={line.categoryId}
                        name={line.name}
                        budgetCents={line.budgetCents}
                        month={month}
                        onSave={(cents) => saveBudget(line.categoryId!, cents)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <CategoryRow
                        key={line.categoryId ?? 'uncategorized'}
                        line={line}
                        divider={index < view.lines.length - 1}
                        onPress={() =>
                          line.categoryId === null
                            ? router.push({
                                pathname: '/activity',
                                params: { month, filter: 'uncategorized' },
                              })
                            : setEditing(line.categoryId)
                        }
                      />
                    ),
                  )}
                </View>
              )}
              {editing === 'pick' ? (
                <View style={styles.stack}>
                  <Text variant="small">Which category?</Text>
                  <View style={styles.wrap}>
                    {unbudgeted.map((c) => (
                      <Chip key={c.id} label={c.name} onPress={() => setEditing(`new:${c.id}`)} />
                    ))}
                  </View>
                  <TextButton label="Cancel" onPress={() => setEditing(null)} />
                </View>
              ) : editing?.startsWith('new:') ? (
                <BudgetEditor
                  name={categories.find((c) => `new:${c.id}` === editing)?.name ?? ''}
                  budgetCents={null}
                  month={month}
                  onSave={(cents) => saveBudget(editing.slice(4), cents)}
                  onCancel={() => setEditing(null)}
                />
              ) : unbudgeted.length > 0 ? (
                <TextButton label="Set a budget" icon="plus" onPress={() => setEditing('pick')} />
              ) : null}
            </Section>
          </>
        );
      }}
    </Loadable>
  );
}

function CategoryRow({
  line,
  divider,
  onPress,
}: {
  line: BudgetLine;
  divider: boolean;
  onPress: () => void;
}) {
  const amounts =
    line.budgetCents === null
      ? formatCents(line.spentCents)
      : `${formatCents(line.spentCents)} of ${formatCents(line.budgetCents)}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={line.categoryId === null ? 'Shows these expenses' : 'Sets this budget'}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text variant="body" style={styles.flex}>
          {line.name}
        </Text>
        <Text variant="bodyMedium" style={styles.tabular}>
          {amounts}
        </Text>
      </View>
      {line.budgetCents !== null ? (
        <ProgressBar
          value={line.spentCents}
          max={line.budgetCents}
          accessibilityLabel={`${line.name}: ${amounts}`}
        />
      ) : null}
      {line.note ? <Text variant="small">{line.note}</Text> : null}
      {line.categoryId === null ? (
        <Text variant="small">Tap to choose categories for these.</Text>
      ) : null}
    </Pressable>
  );
}

function BudgetEditor({
  name,
  budgetCents,
  month,
  onSave,
  onCancel,
}: {
  name: string;
  budgetCents: number | null;
  month: string;
  onSave: (cents: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  return (
    <View style={[styles.stack, styles.row]}>
      <AmountForm
        label={`Monthly budget for ${name}`}
        submitLabel="Save"
        initialCents={budgetCents ?? 0}
        hint={`Applies from ${monthLabel(month)} on, until you change it.`}
        onSubmit={(cents) => onSave(cents)}
        onCancel={onCancel}
      />
      {budgetCents !== null ? (
        <TextButton
          label={removing ? 'Removing…' : 'Remove budget'}
          icon="x"
          onPress={() => {
            setRemoving(true);
            setRemoveError(null);
            void onSave(null).catch((e: Error) => {
              setRemoving(false);
              setRemoveError(e.message);
            });
          }}
          disabled={removing}
        />
      ) : null}
      {removeError ? <FormMessage message={removeError} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
  },
  iconSpacer: {
    width: 44,
  },
  stack: {
    gap: space.md,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  row: {
    gap: space.sm,
    paddingVertical: space.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pressed: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
