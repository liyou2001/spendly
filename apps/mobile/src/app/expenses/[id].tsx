import { formatCents } from '@spendly/ledger';
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
import { explainShare, type Explained } from '@/lib/breakdown';
import { debtLabel, itemTitle, yourPartOf } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { canEditExpense, labelForIds, owedToPayer, type SplitPeople } from '@/lib/split';
import { useLoad } from '@/lib/useLoad';
import { colors, sizes, space } from '@/theme';

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
      onChanged={detail.reload}
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
  onChanged,
  stale,
}: {
  expense: FullExpense;
  group: Group;
  categories: Category[];
  userId: string;
  onBack: () => void;
  onChanged: () => void;
  stale: boolean;
}) {
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whose breakdown is open in the Split list.
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const me = group.people.find((p) => p.userId === userId)?.id ?? '';
  const people: SplitPeople = { me, everyone: group.people.map((p) => p.id) };
  const names = Object.fromEntries(group.people.map((p) => [p.id, p.displayName]));
  const nameOf = (id: string) => (id === me ? 'You' : (names[id] ?? 'Someone'));

  const iPaid = expense.paidBy === me;
  const canEdit = canEditExpense(expense, me, userId);
  const myShare = expense.shares.find((s) => s.participantId === me)?.amountCents ?? null;
  const myCategoryId = expense.myCategoryId;
  const myCategory = categories.find((c) => c.id === myCategoryId)?.name;
  const owed = owedToPayer(expense.shares, expense.paidBy);
  const lines = expense.items.filter((i) => i.kind === 'item');
  const adjustments = expense.items.filter((i) => i.kind !== 'item');
  const mine = myShare ? explainShare(expense.items, me, myShare) : null;
  const shares = [...expense.shares].sort(
    (a, b) => people.everyone.indexOf(a.participantId) - people.everyone.indexOf(b.participantId),
  );

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
      onChanged();
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
        {iPaid ? 'you' : nameOf(expense.paidBy)}
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
        <Text variant="sectionHeading">{myShare !== null ? 'Your share' : 'Total'}</Text>
        <Money cents={myShare ?? expense.totalCents} variant="bigNumber" />
        {myShare ? <Tag label={myCategory ?? 'Uncategorized'} tone="white" /> : null}
        {myShare === null ? <Text variant="body">You’re not on this one.</Text> : null}
        <View style={styles.rows}>
          {owed.map((debt) => (
            <View key={debt.from} style={styles.row}>
              <Text variant="body" style={styles.flex}>
                {debtLabel(debt, me, nameOf)}
              </Text>
              <Money cents={debt.amountCents} variant="bodyMedium" />
            </View>
          ))}
          {myShare !== null ? (
            <View style={styles.row}>
              <Text variant="body" style={styles.flex}>
                Total
              </Text>
              <Money cents={expense.totalCents} variant="bodyMedium" />
            </View>
          ) : null}
        </View>
      </KeyBlock>

      {mine && myShare ? (
        <Section title={`How your ${formatCents(myShare)} was worked out`}>
          <Breakdown explained={mine} whose="Your" />
        </Section>
      ) : null}

      {lines.length > 0 ? (
        <Section title="Receipt" description={`Everyone in ${group.name} sees this receipt.`}>
          <View>
            {[...lines, ...adjustments].map((item) => (
              <ListRow
                key={item.id}
                title={itemTitle(item.name, item.quantity)}
                {...(item.kind === 'item'
                  ? { subtitle: labelForIds(item.participantIds, people, names, item.units) }
                  : { subtitle: 'Split in proportion to items' })}
                trailing={<Money cents={item.amountCents} />}
              />
            ))}
            <ListRow
              title="Total"
              trailing={<Money cents={expense.totalCents} variant="bodyMedium" />}
              divider={false}
            />
          </View>
        </Section>
      ) : null}

      <Section
        title="Split"
        {...(lines.length > 0
          ? { description: 'Tap someone to see how theirs was worked out.' }
          : {})}
      >
        <View>
          {shares.map((share, index) => {
            const open = openPerson === share.participantId;
            const theirs = open
              ? explainShare(expense.items, share.participantId, share.amountCents)
              : null;
            return (
              <View key={share.participantId}>
                <ListRow
                  title={nameOf(share.participantId)}
                  {...(share.participantId === expense.paidBy ? { subtitle: 'Paid' } : {})}
                  trailing={<Money cents={share.amountCents} />}
                  {...(lines.length > 0
                    ? {
                        onPress: () => setOpenPerson(open ? null : share.participantId),
                      }
                    : {})}
                  divider={index < shares.length - 1 && !open}
                />
                {theirs ? (
                  <View style={styles.expanded}>
                    <Breakdown
                      explained={theirs}
                      whose={
                        share.participantId === me ? 'Your' : `${nameOf(share.participantId)}’s`
                      }
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Section>

      {!iPaid && myShare && !expense.voidedAt ? (
        <FileShare
          expenseId={expense.id}
          categories={categories}
          current={myCategoryId}
          onChanged={onChanged}
        />
      ) : null}

      {canEdit && !expense.voidedAt ? (
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
      ) : null}
    </Screen>
  );
}

/** One person's share, line by line, adding up to it. */
function Breakdown({ explained, whose }: { explained: Explained; whose: string }) {
  return (
    <View>
      {explained.items.map((row, index) => (
        <ListRow
          key={`item-${index}`}
          title={row.title}
          {...(row.detail ? { subtitle: row.detail } : {})}
          trailing={<Money cents={row.cents} />}
        />
      ))}
      {explained.adjustments.length > 0 ? (
        <>
          <ListRow
            title={`${whose} items`}
            subtitle={`${explained.percentOfItems} of all items, so ${explained.percentOfItems} of the rest`}
            trailing={<Money cents={explained.itemsCents} />}
          />
          {explained.adjustments.map((row, index) => (
            <ListRow
              key={`adjustment-${index}`}
              title={row.title}
              {...(row.detail ? { subtitle: row.detail } : {})}
              trailing={<Money cents={row.cents} />}
            />
          ))}
        </>
      ) : null}
      <ListRow
        title={`${whose} share`}
        trailing={<Money cents={explained.totalCents} variant="bodyMedium" />}
        divider={false}
      />
    </View>
  );
}

/** "Category for your share", for someone else's expense: only you see it. */
function FileShare({
  expenseId,
  categories,
  current,
  onChanged,
}: {
  expenseId: string;
  categories: Category[];
  current: string | null;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function file(categoryId: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setShareCategory(expenseId, categoryId);
      onChanged();
    } catch (e) {
      setError(friendlyError(e as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Category for your share"
      description="Where your share counts in your budget. Only you see this."
    >
      <View style={styles.wrap}>
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={c.id === current}
            disabled={busy}
            onPress={() => void file(c.id === current ? null : c.id)}
          />
        ))}
      </View>
      {error ? <FormMessage message={error} /> : null}
    </Section>
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
  expanded: {
    paddingLeft: space.lg,
    borderLeftWidth: sizes.hairline,
    borderLeftColor: colors.divider,
    marginBottom: space.sm,
  },
});
