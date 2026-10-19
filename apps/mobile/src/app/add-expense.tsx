import { formatCents } from '@spendly/ledger';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  AddPersonForm,
  Button,
  Chip,
  FormMessage,
  IconButton,
  KeyBlock,
  Loadable,
  Money,
  Screen,
  Section,
  Tag,
  Text,
  TextButton,
  TextField,
} from '@/components';
import { addDays, formatDate, todayLocal } from '@/lib/dates';
import {
  addPerson,
  fetchCategories,
  fetchGroups,
  friendlyError,
  saveExpense,
  type Category,
  type Group,
} from '@/lib/data';
import { debtLabel, joinNames } from '@/lib/labels';
import { deviceDecimalSeparator } from '@/lib/locale';
import { useSession } from '@/lib/session';
import {
  assignedTo,
  assignmentLabel,
  buildSplit,
  nextAssignment,
  owedToPayer,
  savePayload,
  type Assignment,
  type Draft,
  type DraftItem,
  type SplitPeople,
} from '@/lib/split';
import { useLoad } from '@/lib/useLoad';
import { colors, radius, sizes, space, type } from '@/theme';

export default function AddExpense() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const loaded = useLoad(
    useCallback(async () => {
      const [groups, categories] = await Promise.all([fetchGroups(), fetchCategories(userId)]);
      return { groups, categories };
    }, [userId]),
  );
  const close = () => router.back();

  if (loaded.status !== 'ready') {
    return (
      <Screen
        title="Add expense"
        edges={['top', 'bottom', 'left', 'right']}
        headerRight={<IconButton icon="x" label="Close" onPress={close} />}
      >
        <Loadable load={loaded} errorMessage="Couldn’t load your groups.">
          {() => null}
        </Loadable>
      </Screen>
    );
  }

  return (
    <ExpenseForm
      groups={loaded.data.groups}
      categories={loaded.data.categories}
      userId={userId}
      initialGroupId={groupId}
      onGroupsChanged={loaded.reload}
      onClose={close}
    />
  );
}

/** The group to start in: the one asked for, else your newest shared group, else Personal. */
function startingGroup(groups: Group[], requested: string | undefined): Group | undefined {
  return groups.find((g) => g.id === requested) ?? groups.find((g) => !g.isPersonal) ?? groups[0];
}

function emptyDraft(everyone: string[]): Draft {
  return {
    mode: 'items',
    items: [],
    tax: null,
    tip: null,
    quickTotal: '',
    quickSplit: 'even',
    quickPeople: everyone,
    quickAmounts: {},
  };
}

interface ExpenseFormProps {
  groups: Group[];
  categories: Category[];
  userId: string;
  initialGroupId: string | undefined;
  onGroupsChanged: () => void;
  onClose: () => void;
}

function ExpenseForm({
  groups,
  categories,
  userId,
  initialGroupId,
  onGroupsChanged,
  onClose,
}: ExpenseFormProps) {
  // The first row is created with the draft; rows added later count up from here.
  const nextKey = useRef(1);
  const newItem = (): DraftItem => ({
    key: `item-${nextKey.current++}`,
    name: '',
    amount: '',
    assignment: { kind: 'you' },
  });

  const first = startingGroup(groups, initialGroupId);
  const [groupId, setGroupId] = useState(first?.id ?? '');
  const group = groups.find((g) => g.id === groupId) ?? first;
  const meInGroup = group?.people.find((p) => p.userId === userId);

  const [draft, setDraft] = useState<Draft>(() => ({
    ...emptyDraft(first?.people.map((p) => p.id) ?? []),
    items: [{ key: 'item-0', name: '', amount: '', assignment: { kind: 'you' } }],
  }));
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [paidBy, setPaidBy] = useState(meInGroup?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const people: SplitPeople = useMemo(
    () => ({ me: meInGroup?.id ?? '', everyone: group?.people.map((p) => p.id) ?? [] }),
    [group, meInGroup],
  );
  const names = useMemo(
    () => Object.fromEntries((group?.people ?? []).map((p) => [p.id, p.displayName])),
    [group],
  );
  const [decimalSeparator] = useState(deviceDecimalSeparator);
  const amountPlaceholder = `0${decimalSeparator}00`;
  const result = useMemo(
    () => buildSplit(draft, people, { decimalSeparator }),
    [draft, people, decimalSeparator],
  );

  if (!group || !meInGroup) {
    return (
      <Screen
        title="Add expense"
        headerRight={<IconButton icon="x" label="Close" onPress={onClose} />}
      >
        <FormMessage message="Couldn’t find your groups. Close and try again." />
      </Screen>
    );
  }

  const today = todayLocal();
  const shared = !group.isPersonal;
  const nameOf = (id: string) => (id === people.me ? 'You' : (names[id] ?? 'Someone'));
  const myShare = result.shares.find((s) => s.participantId === people.me)?.amountCents ?? 0;
  const category = categories.find((c) => c.id === categoryId);

  const errors: Record<string, string> = { ...result.errors };
  if (!merchant.trim()) errors.merchant = 'Enter where you bought it.';
  if (myShare > 0 && !categoryId) errors.category = 'Pick a category for your share.';
  const visible = (key: string) => (showErrors ? errors[key] : undefined);

  function update(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSaveError(null);
  }
  function updateItem(key: string, patch: Partial<DraftItem>) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
    setSaveError(null);
  }

  function switchGroup(next: Group) {
    const nextMe = next.people.find((p) => p.userId === userId);
    setGroupId(next.id);
    setPaidBy(nextMe?.id ?? '');
    setAddingPerson(false);
    // Specific people don't carry over to another group; You and All do.
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.assignment.kind === 'all' ? item : { ...item, assignment: { kind: 'you' } },
      ),
      quickSplit: 'even',
      quickPeople: next.people.map((p) => p.id),
      quickAmounts: {},
    }));
  }

  async function addPersonToGroup(displayName: string, phone: string | null) {
    let person;
    try {
      person = await addPerson(group!.id, displayName, phone);
    } catch (e) {
      throw new Error(friendlyError(e as Error));
    }
    setDraft((prev) => ({ ...prev, quickPeople: [...prev.quickPeople, person.id] }));
    setAddingPerson(false);
    onGroupsChanged();
  }

  async function save() {
    setShowErrors(true);
    if (Object.keys(errors).length > 0 || result.totalCents === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { p_shares, p_category_id } = savePayload(result.shares, people, paidBy, categoryId);
      const id = await saveExpense({
        groupId: group!.id,
        paidBy,
        merchant: merchant.trim(),
        expenseDate: date,
        totalCents: result.totalCents,
        items: result.items,
        shares: p_shares,
        categoryId: p_category_id,
      });
      router.replace({ pathname: '/expenses/[id]', params: { id } });
    } catch (e) {
      setSaveError(friendlyError(e as Error));
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Add expense"
      edges={['top', 'bottom', 'left', 'right']}
      headerRight={<IconButton icon="x" label="Close" onPress={onClose} />}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {groups.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            icon={g.isPersonal ? 'user' : 'users'}
            selected={g.id === group.id}
            onPress={() => switchGroup(g)}
          />
        ))}
      </ScrollView>

      <View style={styles.stack}>
        <TextField
          label="Where"
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Costco"
          error={visible('merchant')}
          autoCapitalize="words"
          maxLength={200}
        />
        <View style={styles.dateRow}>
          <Text variant="sectionHeading" style={styles.flex}>
            Date
          </Text>
          <IconButton
            icon="chevron-left"
            label="Day before"
            onPress={() => setDate(addDays(date, -1))}
          />
          <Text variant="body" style={styles.dateText}>
            {formatDate(date, today)}
          </Text>
          {date < today ? (
            <IconButton
              icon="chevron-right"
              label="Day after"
              onPress={() => setDate(addDays(date, 1))}
            />
          ) : (
            <View style={styles.iconSpacer} />
          )}
        </View>
      </View>

      {shared ? (
        <Section title="Paid by">
          <View style={styles.wrap}>
            {group.people.map((p) => (
              <Chip
                key={p.id}
                label={nameOf(p.id)}
                selected={p.id === paidBy}
                onPress={() => setPaidBy(p.id)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      {shared ? (
        <Section
          title="People"
          description={
            draft.mode === 'items'
              ? 'Tap an item’s tag to change who it’s for.'
              : 'Tap people to include or leave them out.'
          }
        >
          <View style={styles.wrap}>
            {group.people.map((p) =>
              draft.mode === 'quick' ? (
                <Chip
                  key={p.id}
                  label={nameOf(p.id)}
                  selected={draft.quickPeople.includes(p.id)}
                  onPress={() =>
                    update({
                      quickPeople: draft.quickPeople.includes(p.id)
                        ? draft.quickPeople.filter((id) => id !== p.id)
                        : [...draft.quickPeople, p.id],
                    })
                  }
                />
              ) : (
                <Tag
                  key={p.id}
                  label={nameOf(p.id)}
                  tone={p.id === people.me ? 'accent' : 'neutral'}
                />
              ),
            )}
          </View>
          {addingPerson ? (
            <AddPersonForm onAdd={addPersonToGroup} onCancel={() => setAddingPerson(false)} />
          ) : (
            <TextButton label="Add person" icon="user-plus" onPress={() => setAddingPerson(true)} />
          )}
        </Section>
      ) : null}

      <View style={styles.wrap}>
        <Chip
          label="Itemized"
          icon="list"
          selected={draft.mode === 'items'}
          onPress={() => update({ mode: 'items' })}
        />
        <Chip
          label="Just a total"
          icon="hash"
          selected={draft.mode === 'quick'}
          onPress={() => update({ mode: 'quick' })}
        />
      </View>

      {draft.mode === 'items' ? (
        <Section title="Items">
          <View>
            {draft.items.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                people={people}
                names={names}
                nameOf={nameOf}
                error={visible(item.key)}
                onChange={(patch) => updateItem(item.key, patch)}
                onRemove={
                  draft.items.length > 1
                    ? () => update({ items: draft.items.filter((i) => i.key !== item.key) })
                    : undefined
                }
                amountPlaceholder={amountPlaceholder}
              />
            ))}
          </View>
          <TextButton
            label="Add item"
            icon="plus"
            onPress={() => update({ items: [...draft.items, newItem()] })}
          />
          {(['tax', 'tip'] as const).map((kind) =>
            draft[kind] === null ? null : (
              <AdjustmentRow
                key={kind}
                label={kind === 'tax' ? 'Tax' : 'Tip'}
                value={draft[kind] ?? ''}
                error={visible(kind)}
                onChange={(value) => update({ [kind]: value })}
                onRemove={() => update({ [kind]: null })}
                amountPlaceholder={amountPlaceholder}
              />
            ),
          )}
          {draft.tax === null || draft.tip === null ? (
            <View style={styles.wrap}>
              {draft.tax === null ? (
                <TextButton label="Add tax" icon="plus" onPress={() => update({ tax: '' })} />
              ) : null}
              {draft.tip === null ? (
                <TextButton label="Add tip" icon="plus" onPress={() => update({ tip: '' })} />
              ) : null}
            </View>
          ) : (
            <Text variant="small">Tax and tip are split in proportion to each person’s items.</Text>
          )}
        </Section>
      ) : (
        <Section title="Total">
          <TextField
            label="Total"
            value={draft.quickTotal}
            onChangeText={(quickTotal) => update({ quickTotal })}
            placeholder={amountPlaceholder}
            keyboardType="decimal-pad"
            error={visible('quickTotal')}
          />
          {shared ? (
            <View style={styles.wrap}>
              <Chip
                label="Split evenly"
                selected={draft.quickSplit === 'even'}
                onPress={() => update({ quickSplit: 'even' })}
              />
              <Chip
                label="By amount"
                selected={draft.quickSplit === 'amounts'}
                onPress={() => update({ quickSplit: 'amounts' })}
              />
            </View>
          ) : null}
          {shared && draft.quickSplit === 'amounts'
            ? people.everyone
                .filter((id) => draft.quickPeople.includes(id))
                .map((id) => (
                  <View key={id} style={styles.stack}>
                    <View style={styles.amountRow}>
                      <Text variant="body" style={styles.flex}>
                        {nameOf(id)}
                      </Text>
                      <TextInput
                        value={draft.quickAmounts[id] ?? ''}
                        onChangeText={(text) =>
                          update({ quickAmounts: { ...draft.quickAmounts, [id]: text } })
                        }
                        placeholder={amountPlaceholder}
                        placeholderTextColor={colors.muted}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${nameOf(id)}’s amount`}
                        style={[styles.input, styles.amountInput]}
                      />
                    </View>
                    {visible(`amount:${id}`) ? (
                      <FormMessage message={visible(`amount:${id}`)!} />
                    ) : null}
                  </View>
                ))
            : null}
          {visible('quickAmounts') || visible('form') ? (
            <FormMessage message={(visible('quickAmounts') ?? visible('form'))!} />
          ) : null}
        </Section>
      )}

      <Section title={shared ? 'Category for your share' : 'Category'}>
        <View style={styles.wrap}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === categoryId}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </View>
        {visible('category') ? <FormMessage message={visible('category')!} /> : null}
      </Section>

      <Summary
        totalCents={result.totalCents}
        myShare={myShare}
        categoryName={category?.name}
        owed={owedToPayer(result.shares, paidBy)}
        nameOf={nameOf}
        me={people.me}
        hasErrors={Object.keys(result.errors).length > 0}
      />

      <View style={styles.stack}>
        {showErrors && Object.keys(errors).length > 0 ? (
          <FormMessage
            message={
              draft.mode === 'items' && errors.form
                ? errors.form
                : 'Fix the highlighted details to save.'
            }
          />
        ) : null}
        {saveError ? <FormMessage message={saveError} /> : null}
        <Button label="Save expense" onPress={() => void save()} loading={saving} />
      </View>
    </Screen>
  );
}

interface ItemRowProps {
  item: DraftItem;
  people: SplitPeople;
  names: Record<string, string>;
  nameOf: (id: string) => string;
  error: string | undefined;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: (() => void) | undefined;
  amountPlaceholder: string;
}

function ItemRow({
  item,
  people,
  names,
  nameOf,
  error,
  onChange,
  onRemove,
  amountPlaceholder,
}: ItemRowProps) {
  const label = assignmentLabel(item.assignment, people, names);
  const alone = people.everyone.length === 1;
  const custom = item.assignment.kind === 'custom' ? item.assignment : null;

  function toggle(id: string) {
    if (!custom) return;
    const ids = custom.participantIds.includes(id)
      ? custom.participantIds.filter((x) => x !== id)
      : [...custom.participantIds, id];
    onChange({ assignment: { kind: 'custom', participantIds: ids } });
  }

  return (
    <View style={styles.item}>
      <View style={styles.itemLine}>
        <TextInput
          value={item.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Item"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Item name"
          autoCapitalize="sentences"
          maxLength={200}
          style={[styles.input, styles.flex]}
        />
        <TextInput
          value={item.amount}
          onChangeText={(amount) => onChange({ amount })}
          placeholder={amountPlaceholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          accessibilityLabel={`${item.name || 'Item'} amount`}
          style={[styles.input, styles.amountInput]}
        />
      </View>
      <View style={styles.itemLine}>
        {alone ? (
          <Tag label="You" tone="accent" />
        ) : (
          <Chip
            label={label}
            tone={item.assignment.kind === 'you' ? 'you' : 'neutral'}
            icon="repeat"
            onPress={() => onChange({ assignment: nextAssignment(item.assignment, people) })}
            accessibilityLabel={`For ${label}`}
            accessibilityHint="Changes who this item is for"
          />
        )}
        <View style={styles.flex} />
        {onRemove ? (
          <IconButton icon="trash-2" label={`Remove ${item.name || 'item'}`} onPress={onRemove} />
        ) : null}
      </View>
      {custom ? (
        <View style={styles.wrap}>
          {people.everyone.map((id) => (
            <Chip
              key={id}
              label={nameOf(id)}
              selected={assignedTo(custom as Assignment, people).includes(id)}
              onPress={() => toggle(id)}
            />
          ))}
        </View>
      ) : null}
      {error ? <FormMessage message={error} /> : null}
    </View>
  );
}

function AdjustmentRow({
  label,
  value,
  error,
  onChange,
  onRemove,
  amountPlaceholder,
}: {
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onRemove: () => void;
  amountPlaceholder: string;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.amountRow}>
        <Text variant="body" style={styles.flex}>
          {label}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={amountPlaceholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          accessibilityLabel={`${label} amount`}
          style={[styles.input, styles.amountInput]}
        />
        <IconButton icon="x" label={`Remove ${label.toLowerCase()}`} onPress={onRemove} />
      </View>
      {error ? <FormMessage message={error} /> : null}
    </View>
  );
}

function Summary({
  totalCents,
  myShare,
  categoryName,
  owed,
  nameOf,
  me,
  hasErrors,
}: {
  totalCents: number | null;
  myShare: number;
  categoryName: string | undefined;
  owed: { from: string; to: string; amountCents: number }[];
  nameOf: (id: string) => string;
  me: string;
  hasErrors: boolean;
}) {
  if (totalCents === null) {
    return (
      <KeyBlock>
        <Text variant="sectionHeading">Your share</Text>
        <Text variant="body">Add amounts to see how it splits.</Text>
      </KeyBlock>
    );
  }

  // Everyone who'll see this expense through their own share, i.e. not the payer.
  const viewers = owed.filter((d) => d.from !== me).map((d) => nameOf(d.from));
  const privacy =
    viewers.length === 0
      ? 'Only you can see this expense.'
      : `${joinNames(viewers)} ${viewers.length === 1 ? 'sees' : 'each see'} only their own items and amount, never the total.`;

  return (
    <KeyBlock>
      <Text variant="sectionHeading">Your share</Text>
      <Money
        cents={myShare}
        variant="bigNumber"
        accessibilityLabel={`Your share ${formatCents(myShare)}`}
      />
      <Text variant="body">
        {myShare > 0 ? `→ ${categoryName ?? 'pick a category'}` : 'Nothing for you'}
      </Text>
      <View style={styles.summaryRows}>
        {owed.map((debt) => (
          <View key={debt.from} style={styles.summaryRow}>
            <Text variant="body" style={styles.flex}>
              {debtLabel(debt, me, nameOf)}
            </Text>
            <Money cents={debt.amountCents} variant="bodyMedium" />
          </View>
        ))}
        <View style={styles.summaryRow}>
          <Text variant="body" style={styles.flex}>
            Total
          </Text>
          <Money cents={totalCents} variant="bodyMedium" />
        </View>
      </View>
      {hasErrors ? (
        <Text variant="small">Some lines aren’t counted yet; check them before saving.</Text>
      ) : null}
      <Text variant="small">{privacy}</Text>
    </KeyBlock>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  chips: {
    gap: space.sm,
    paddingVertical: 2,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    minWidth: 104,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  iconSpacer: {
    width: sizes.touch,
  },
  item: {
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  itemLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  input: {
    ...type.body,
    minHeight: sizes.touch,
    borderWidth: sizes.hairline,
    borderColor: colors.controlBorder,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  amountInput: {
    width: 104,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  summaryRows: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
