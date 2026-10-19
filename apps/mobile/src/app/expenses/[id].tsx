import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  FormMessage,
  KeyBlock,
  ListRow,
  Loadable,
  Money,
  Screen,
  Section,
  STALE_MESSAGE,
  Tag,
  Text,
  TextButton,
} from '@/components';
import {
  fetchCategories,
  fetchExpense,
  fetchGroup,
  friendlyError,
  setShareCategory,
  voidExpense,
  type Category,
  type FullExpense,
  type Group,
  type ShareOfExpense,
} from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { debtLabel, itemTitle, yourPartOf } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { labelForIds, owedToPayer, type SplitPeople } from '@/lib/split';
import { useLoad } from '@/lib/useLoad';
import { space } from '@/theme';

async function fetchDetail(expenseId: string, userId: string) {
  const [expense, categories] = await Promise.all([
    fetchExpense(expenseId),
    fetchCategories(userId),
  ]);
  if (!expense) throw new Error('Expense not found');
  return { expense, group: await fetchGroup(expense.groupId), categories };
}

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const detail = useLoad(useCallback(() => fetchDetail(id, userId), [id, userId]));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (detail.status !== 'ready') {
    return (
      <Screen onBack={back}>
        <Loadable load={detail} errorMessage="Couldn’t load this expense.">
          {() => null}
        </Loadable>
      </Screen>
    );
  }

  const { expense, group, categories } = detail.data;
  return expense.view === 'full' ? (
    <FullView
      expense={expense}
      group={group}
      categories={categories}
      userId={userId}
      onBack={back}
      onVoided={detail.reload}
      stale={detail.refreshFailed}
    />
  ) : (
    <ShareView
      expense={expense}
      group={group}
      categories={categories}
      onBack={back}
      stale={detail.refreshFailed}
      onChanged={detail.reload}
    />
  );
}

function FullView({
  expense,
  group,
  categories,
  userId,
  onBack,
  onVoided,
  stale,
}: {
  expense: FullExpense;
  group: Group;
  categories: Category[];
  userId: string;
  onBack: () => void;
  onVoided: () => void;
  stale: boolean;
}) {
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = group.people.find((p) => p.userId === userId)?.id ?? '';
  const people: SplitPeople = { me, everyone: group.people.map((p) => p.id) };
  const names = Object.fromEntries(group.people.map((p) => [p.id, p.displayName]));
  const nameOf = (id: string) => (id === me ? 'You' : (names[id] ?? 'Someone'));

  const myShare = expense.shares.find((s) => s.participantId === me);
  const myCategoryId =
    expense.paidBy === me ? expense.categoryId : (myShare?.categoryOverrideId ?? null);
  const myCategory = categories.find((c) => c.id === myCategoryId)?.name;
  const owed = owedToPayer(expense.shares, expense.paidBy);
  const lines = expense.items.filter((i) => i.kind === 'item');
  const adjustments = expense.items.filter((i) => i.kind !== 'item');

  function confirmVoid() {
    Alert.alert(
      'Void this expense?',
      'It stays in your history but stops counting toward balances and budgets. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void expense', style: 'destructive', onPress: () => void runVoid() },
      ],
    );
  }

  async function runVoid() {
    setVoiding(true);
    setError(null);
    try {
      await voidExpense(expense.id);
      onVoided();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setVoiding(false);
    }
  }

  return (
    <Screen title={expense.merchant} onBack={onBack}>
      {stale ? <FormMessage message={STALE_MESSAGE} /> : null}
      <Text variant="small">
        {formatDate(expense.expenseDate)} · {group.name} · paid by{' '}
        {expense.paidBy === me ? 'you' : nameOf(expense.paidBy)}
      </Text>

      {expense.replacedById ? (
        <View style={styles.stack}>
          <FormMessage message="Replaced by an edit. This earlier version is kept in history but no longer counts." />
          <TextButton
            label="See the current version"
            icon="arrow-right"
            onPress={() => openExpense(expense.replacedById!)}
          />
        </View>
      ) : expense.voidedAt ? (
        <FormMessage message="Voided. It’s kept in history but no longer counts toward balances or budgets." />
      ) : expense.replacesExpenseId ? (
        <TextButton
          label="Edited · see the original"
          icon="clock"
          onPress={() => openExpense(expense.replacesExpenseId!)}
        />
      ) : null}

      <KeyBlock>
        <Text variant="sectionHeading">Your share</Text>
        <Money cents={myShare?.amountCents ?? 0} variant="bigNumber" />
        {myShare && myShare.amountCents > 0 ? (
          <Tag label={myCategory ?? 'Uncategorized'} tone="white" />
        ) : null}
        <View style={styles.rows}>
          {owed.map((debt) => (
            <View key={debt.from} style={styles.row}>
              <Text variant="body" style={styles.flex}>
                {debtLabel(debt, me, nameOf)}
              </Text>
              <Money cents={debt.amountCents} variant="bodyMedium" />
            </View>
          ))}
          <View style={styles.row}>
            <Text variant="body" style={styles.flex}>
              Total
            </Text>
            <Money cents={expense.totalCents} variant="bodyMedium" />
          </View>
        </View>
      </KeyBlock>

      {lines.length > 0 ? (
        <Section title="Items">
          <View>
            {[...lines, ...adjustments].map((item, index, all) => (
              <ListRow
                key={item.id}
                title={itemTitle(item.name, item.quantity)}
                {...(item.kind === 'item'
                  ? { subtitle: labelForIds(item.participantIds, people, names, item.units) }
                  : { subtitle: 'Split in proportion' })}
                trailing={<Money cents={item.amountCents} />}
                divider={index < all.length - 1}
              />
            ))}
          </View>
        </Section>
      ) : (
        <Section title="Split">
          <View>
            {[...expense.shares]
              .sort(
                (a, b) =>
                  people.everyone.indexOf(a.participantId) -
                  people.everyone.indexOf(b.participantId),
              )
              .map((share, index, all) => (
                <ListRow
                  key={share.participantId}
                  title={nameOf(share.participantId)}
                  trailing={<Money cents={share.amountCents} />}
                  divider={index < all.length - 1}
                />
              ))}
          </View>
        </Section>
      )}

      {expense.voidedAt ? null : (
        <View style={styles.stack}>
          {error ? <FormMessage message={error} /> : null}
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button
                label="Edit"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/add-expense', params: { edit: expense.id } })
                }
                disabled={expense.hasForgiveness}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="Void expense"
                variant="secondary"
                onPress={confirmVoid}
                loading={voiding}
              />
            </View>
          </View>
          {expense.hasForgiveness ? (
            <Text variant="small">
              A debt on this expense was forgiven, so it can’t be edited. Void it and add it again
              instead.
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function ShareView({
  expense,
  group,
  categories,
  onBack,
  stale,
  onChanged,
}: {
  expense: ShareOfExpense;
  group: Group;
  categories: Category[];
  onBack: () => void;
  stale: boolean;
  onChanged: () => void;
}) {
  const category = categories.find((c) => c.id === expense.categoryId)?.name;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function file(categoryId: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setShareCategory(expense.id, categoryId);
      onChanged();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={expense.merchant} onBack={onBack}>
      {stale ? <FormMessage message={STALE_MESSAGE} /> : null}
      <Text variant="small">
        {formatDate(expense.expenseDate)} · {group.name} · paid by {expense.payerName}
      </Text>
      <KeyBlock>
        <Text variant="sectionHeading">Your share</Text>
        <Money cents={expense.amountCents} variant="bigNumber" />
        <Text variant="body">You owe {expense.payerName}</Text>
        {category ? <Tag label={category} tone="white" /> : null}
      </KeyBlock>
      {expense.items.length > 0 ? (
        <Section title="Your items">
          <View>
            {expense.items.map((item, index) => (
              <ListRow
                key={`${item.name}-${index}`}
                title={itemTitle(item.name, item.quantity)}
                {...(yourPartOf(item) ? { subtitle: yourPartOf(item)! } : {})}
                trailing={<Money cents={item.amountCents} />}
                divider={index < expense.items.length - 1}
              />
            ))}
          </View>
        </Section>
      ) : null}
      <Section
        title="Category for your share"
        description="Where your share counts in your budget. Only you see this."
      >
        <View style={styles.wrap}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === expense.categoryId}
              disabled={busy}
              onPress={() => void file(c.id === expense.categoryId ? null : c.id)}
            />
          ))}
        </View>
        {error ? <FormMessage message={error} /> : null}
      </Section>
      <View style={styles.note}>
        <Tag label="Private" />
        <Text variant="small" style={styles.flex}>
          You see only your own items and amount. Tax and tip are included in your share.
        </Text>
      </View>
    </Screen>
  );
}

const openExpense = (id: string) => router.push({ pathname: '/expenses/[id]', params: { id } });

const styles = StyleSheet.create({
  stack: {
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  rows: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
