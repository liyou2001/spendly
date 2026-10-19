import { formatCents } from '@spendly/ledger';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

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
  createGroup,
  fetchCategories,
  fetchExpense,
  fetchGroup,
  fetchGroups,
  fetchKnownPeople,
  friendlyError,
  saveExpense,
  UserFacingError,
  type Category,
  type Group,
} from '@/lib/data';
import { debtLabel, joinNames } from '@/lib/labels';
import { deviceDecimalSeparator } from '@/lib/locale';
import { dedupePeople, oneOffName, type KnownPerson } from '@/lib/oneOff';
import { useSession } from '@/lib/session';
import {
  assignedTo,
  assignmentLabel,
  buildSplit,
  draftFromExpense,
  assignmentOptions,
  sameAssignment,
  owedToPayer,
  savePayload,
  type Assignment,
  type Draft,
  type DraftItem,
  type EditableExpense,
  type SplitPeople,
} from '@/lib/split';
import { useLoad } from '@/lib/useLoad';
import { colors, radius, sizes, space, type } from '@/theme';

async function fetchForm(userId: string, editId: string | undefined) {
  const [groups, categories, expense, known] = await Promise.all([
    fetchGroups(),
    fetchCategories(userId),
    editId ? fetchExpense(editId) : Promise.resolve(null),
    editId ? Promise.resolve([]) : fetchKnownPeople(userId),
  ]);
  const knownPeople = dedupePeople(known);
  if (!editId) return { groups, categories, knownPeople, editing: null };

  const group = groups.find((g) => g.id === expense?.groupId);
  const me = group?.people.find((p) => p.userId === userId);
  if (!expense || expense.view !== 'full' || !group || !me) {
    throw new UserFacingError('Only the person who paid or entered an expense can edit it.');
  }
  const people = { me: me.id, everyone: group.people.map((p) => p.id) };
  const form = draftFromExpense(expense, people, { decimalSeparator: deviceDecimalSeparator() });
  if (!form.ok) throw new UserFacingError(form.reason);
  return {
    groups,
    categories,
    knownPeople,
    editing: { expenseId: expense.id, groupId: group.id, ...form.value },
  };
}

export default function AddExpense() {
  const { groupId, edit } = useLocalSearchParams<{ groupId?: string; edit?: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const loaded = useLoad(useCallback(() => fetchForm(userId, edit), [userId, edit]));
  const close = () => router.back();

  if (loaded.status !== 'ready') {
    return (
      <Screen
        title={edit ? 'Edit expense' : 'Add expense'}
        edges={['top', 'bottom', 'left', 'right']}
        headerRight={<IconButton icon="x" label="Close" onPress={close} />}
      >
        <Loadable
          load={loaded}
          errorMessage={
            loaded.status === 'error' && loaded.error instanceof UserFacingError
              ? loaded.error.message
              : edit
                ? 'Couldn’t load this expense.'
                : 'Couldn’t load your groups.'
          }
        >
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
      initialGroupId={loaded.data.editing?.groupId ?? groupId}
      editing={loaded.data.editing}
      knownPeople={loaded.data.knownPeople}
      onGroupsChanged={loaded.reload}
      onClose={close}
    />
  );
}

/** The group to start in: the one asked for, else your newest shared group, else Personal. */
function startingGroup(groups: Group[], requested: string | undefined): Group | undefined {
  return (
    groups.find((g) => g.id === requested) ??
    groups.find((g) => !g.isPersonal && !g.isOneOff) ??
    groups.find((g) => g.isPersonal) ??
    groups[0]
  );
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
  /** Set when editing: the form starts from this expense and saving replaces it. */
  editing: (EditableExpense & { expenseId: string }) | null;
  /** People from your other groups, suggested when starting a quick split. */
  knownPeople: KnownPerson[];
  onGroupsChanged: () => void;
  onClose: () => void;
}

function ExpenseForm({
  groups: loadedGroups,
  categories,
  userId,
  initialGroupId,
  editing,
  knownPeople,
  onGroupsChanged,
  onClose,
}: ExpenseFormProps) {
  // A quick split made here is used straight away, before the reloaded group list arrives.
  const [madeHere, setMadeHere] = useState<Group[]>([]);
  const groups = useMemo(
    () => [...loadedGroups, ...madeHere.filter((m) => !loadedGroups.some((g) => g.id === m.id))],
    [loadedGroups, madeHere],
  );
  const [choosingOneOff, setChoosingOneOff] = useState(false);
  // Rows the form starts with are numbered first; rows added later count up from there.
  const nextKey = useRef(editing ? editing.draft.items.length : 1);
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

  const [draft, setDraft] = useState<Draft>(
    () =>
      editing?.draft ?? {
        ...emptyDraft(first?.people.map((p) => p.id) ?? []),
        items: [{ key: 'item-0', name: '', amount: '', assignment: { kind: 'you' } }],
      },
  );
  const [merchant, setMerchant] = useState(editing?.merchant ?? '');
  const [date, setDate] = useState(editing?.expenseDate ?? todayLocal());
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? meInGroup?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
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

  async function addPersonToGroup(
    displayName: string,
    phone: string | null,
    inviteUserId: string | null,
  ) {
    let personId: string;
    try {
      personId = await addPerson(group!.id, displayName, phone, inviteUserId);
    } catch (e) {
      throw new Error(friendlyError(e as Error));
    }
    setDraft((prev) => ({ ...prev, quickPeople: [...prev.quickPeople, personId] }));
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
        ...(editing ? { replacesExpenseId: editing.expenseId } : {}),
      });
      if (editing) {
        // Close the editor, then swap the old version's screen for the new one.
        router.back();
      }
      router.replace({ pathname: '/expenses/[id]', params: { id } });
    } catch (e) {
      setSaveError(friendlyError(e as Error));
      setSaving(false);
    }
  }

  return (
    <Screen
      title={editing ? 'Edit expense' : 'Add expense'}
      edges={['top', 'bottom', 'left', 'right']}
      headerRight={<IconButton icon="x" label="Close" onPress={onClose} />}
    >
      {editing ? (
        // A correction stays in the same group (save_expense requires it).
        <Text variant="small">
          In {group.name}. Saving replaces the original; it stays in history.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {groups
            .filter((g) => !g.isOneOff || g.id === group.id)
            .sort(
              (a, b) =>
                Number(b.id === group.id && b.isOneOff) - Number(a.id === group.id && a.isOneOff),
            )
            .map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                icon={g.isPersonal ? 'user' : g.isOneOff ? 'zap' : 'users'}
                selected={g.id === group.id && !choosingOneOff}
                onPress={() => {
                  setChoosingOneOff(false);
                  switchGroup(g);
                }}
              />
            ))}
          <Chip
            label="Quick split"
            icon="plus"
            selected={choosingOneOff}
            onPress={() => setChoosingOneOff(true)}
            accessibilityHint="Split with people just this once, without making a group"
          />
        </ScrollView>
      )}

      {choosingOneOff ? (
        <OneOffPicker
          knownPeople={knownPeople}
          date={date}
          onCancel={() => setChoosingOneOff(false)}
          onStarted={async (groupId) => {
            const made = await fetchGroup(groupId);
            setMadeHere((prev) => [...prev, made]);
            setChoosingOneOff(false);
            switchGroup(made);
            onGroupsChanged();
          }}
        />
      ) : (
        <>
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
                {addingPerson ? null : (
                  <Chip label="Add person" icon="user-plus" onPress={() => setAddingPerson(true)} />
                )}
              </View>
              {addingPerson ? (
                <AddPersonForm onAdd={addPersonToGroup} onCancel={() => setAddingPerson(false)} />
              ) : null}
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
                    open={openItem === item.key}
                    onToggle={() => setOpenItem(openItem === item.key ? null : item.key)}
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
                <Text variant="small">
                  Tax and tip are split in proportion to each person’s items.
                </Text>
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
                <View style={styles.stack}>
                  <Text variant="small">Split between</Text>
                  <View style={styles.wrap}>
                    {group.people.map((p) => (
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
                    ))}
                  </View>
                </View>
              ) : null}
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
            <Button
              label={editing ? 'Save changes' : 'Save expense'}
              onPress={() => void save()}
              loading={saving}
            />
          </View>
        </>
      )}
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
  /** Whether this item's "Who's it for?" dropdown is open. Only one is open at a time. */
  open: boolean;
  onToggle: () => void;
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
  open,
  onToggle,
}: ItemRowProps) {
  const label = assignmentLabel(item.assignment, people, names);
  const alone = people.everyone.length === 1;
  const custom = item.assignment.kind === 'custom' ? item.assignment : null;
  const choose = (assignment: Assignment) => {
    onChange({ assignment });
    onToggle();
  };

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
          <>
            <Text variant="small">Who’s it for?</Text>
            <Chip
              label={label}
              tone={item.assignment.kind === 'you' ? 'you' : 'neutral'}
              trailingIcon={open ? 'chevron-up' : 'chevron-down'}
              onPress={onToggle}
              expanded={open}
              accessibilityLabel={`Who it’s for: ${label}`}
              accessibilityHint="Opens a list of people to choose from"
            />
          </>
        )}
        <View style={styles.flex} />
        {onRemove ? (
          <IconButton icon="trash-2" label={`Remove ${item.name || 'item'}`} onPress={onRemove} />
        ) : null}
      </View>
      {open ? (
        <View style={styles.dropdown}>
          {assignmentOptions(people, names).map((option) => (
            <DropdownRow
              key={option.key}
              label={option.label}
              selected={sameAssignment(option.assignment, item.assignment)}
              onPress={() => choose(option.assignment)}
            />
          ))}
          <DropdownRow
            label="Choose people…"
            selected={custom !== null}
            onPress={() =>
              choose({ kind: 'custom', participantIds: assignedTo(item.assignment, people) })
            }
            last
          />
        </View>
      ) : null}
      {custom ? (
        <View style={styles.wrap}>
          {people.everyone.map((id) => (
            <Chip
              key={id}
              label={nameOf(id)}
              selected={assignedTo(custom, people).includes(id)}
              onPress={() => toggle(id)}
            />
          ))}
        </View>
      ) : null}
      {error ? <FormMessage message={error} /> : null}
    </View>
  );
}

function DropdownRow({
  label,
  selected,
  onPress,
  last = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.dropdownRow,
        !last && styles.dropdownDivider,
        pressed && styles.pressed,
      ]}
    >
      <Text variant={selected ? 'bodyMedium' : 'body'} style={styles.flex} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Feather name="check" size={18} color={colors.ink} /> : null}
    </Pressable>
  );
}

interface ChosenPerson {
  key: string;
  displayName: string;
  phone: string | null;
  /** Their account, when they use Spendly: they're invited when the quick split starts. */
  inviteUserId: string | null;
}

const personKey = (p: { displayName: string; phone: string | null; userId?: string | null }) =>
  (p.userId ? `user:${p.userId}` : null) ?? p.phone ?? `name:${p.displayName.trim().toLowerCase()}`;

/** "Who was there?": picks people for a quick split and creates it. */
function OneOffPicker({
  knownPeople,
  date,
  onCancel,
  onStarted,
}: {
  knownPeople: KnownPerson[];
  date: string;
  onCancel: () => void;
  onStarted: (groupId: string) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<ChosenPerson[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = knownPeople
    .filter((p) => !chosen.some((c) => c.key === personKey(p)))
    .slice(0, 12);
  const add = (person: {
    displayName: string;
    phone: string | null;
    inviteUserId: string | null;
  }) => {
    const key = personKey({ ...person, userId: person.inviteUserId });
    setChosen((prev) => (prev.some((c) => c.key === key) ? prev : [...prev, { key, ...person }]));
    setError(null);
  };

  async function start() {
    if (pending) {
      setError('You typed a person but didn’t add them. Tap Add, or clear their name.');
      return;
    }
    if (chosen.length === 0) {
      setError('Add at least one person to split with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createGroup(
        oneOffName(
          chosen.map((c) => c.displayName),
          date,
        ),
        chosen.map(({ displayName, phone, inviteUserId }) => ({
          displayName,
          phone,
          inviteUserId,
        })),
        { oneOff: true },
      );
      await onStarted(id);
    } catch (e) {
      setError(friendlyError(e as Error));
      setBusy(false);
    }
  }

  return (
    <Section
      title="Who was there?"
      description="Split with people just this once. It won’t be added to your groups."
    >
      {chosen.length > 0 ? (
        <View style={styles.wrap}>
          {chosen.map((person) => (
            <Chip
              key={person.key}
              label={person.displayName}
              selected
              trailingIcon="x"
              onPress={() => setChosen((prev) => prev.filter((c) => c.key !== person.key))}
              accessibilityLabel={`Remove ${person.displayName}`}
            />
          ))}
        </View>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={styles.stack}>
          <Text variant="small">People you’ve split with</Text>
          <View style={styles.wrap}>
            {suggestions.map((person) => (
              <Chip
                key={personKey(person)}
                label={
                  person.username ? `${person.displayName} @${person.username}` : person.displayName
                }
                icon="plus"
                onPress={() =>
                  add({
                    displayName: person.displayName,
                    phone: person.phone,
                    inviteUserId: person.userId ?? null,
                  })
                }
                accessibilityLabel={`Add ${person.displayName}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      <AddPersonForm
        submitLabel="Add"
        onPendingChange={setPending}
        onAdd={async (displayName, phone, inviteUserId) =>
          add({ displayName, phone, inviteUserId })
        }
      />
      {error ? <FormMessage message={error} /> : null}
      <View style={styles.amountRow}>
        <View style={styles.flex}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
        <View style={styles.flex}>
          <Button label="Start split" onPress={() => void start()} loading={busy} />
        </View>
      </View>
    </Section>
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
  dropdown: {
    backgroundColor: colors.accentPale,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
  },
  dropdownRow: {
    minHeight: sizes.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dropdownDivider: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.background,
  },
  pressed: {
    opacity: 0.6,
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
