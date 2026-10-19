import { formatCents } from '@spendly/ledger';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  AddPersonForm,
  Button,
  CalendarPicker,
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
import { formatDate, todayLocal } from '@/lib/dates';
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
import { debtLabel, evenSplitMessage } from '@/lib/labels';
import { deviceDecimalSeparator } from '@/lib/locale';
import { dedupePeople, oneOffName, type KnownPerson } from '@/lib/oneOff';
import {
  categoryForReceipt,
  draftFromReceipt,
  hasEnteredDetails,
  totalCheck,
  type ScannedReceipt,
  type ScanResult,
} from '@/lib/receipts';
import { pickReceiptPhoto, scanReceipt } from '@/lib/scan';
import { useSession } from '@/lib/session';
import {
  assignedTo,
  assignmentLabel,
  buildSplit,
  canEditExpense,
  draftFromExpense,
  assignmentOptions,
  sameAssignment,
  effectiveAssignment,
  owedToPayer,
  readQuantity,
  retag,
  savePayload,
  tagsFor,
  toggleEvenSplit,
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
  if (
    !expense ||
    expense.view !== 'full' ||
    !group ||
    !me ||
    !canEditExpense(expense, me.id, userId)
  ) {
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
    discount: null,
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
    quantity: '',
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
        items: [{ key: 'item-0', name: '', amount: '', quantity: '', assignment: { kind: 'you' } }],
      },
  );
  const [merchant, setMerchant] = useState(editing?.merchant ?? '');
  const [date, setDate] = useState(editing?.expenseDate ?? todayLocal());
  const [choosingDate, setChoosingDate] = useState(false);
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? meInGroup?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const scanAttempt = useRef(0);
  const scanning = scan.status === 'scanning';

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

  /** Fills the form from a scanned receipt. The AI's draft is only a start: everything is editable. */
  function applyScan(scanned: ScanResult) {
    if (scanned.status === 'unreadable') {
      setScan({
        status: 'error',
        message: `Couldn’t read that receipt (${scanned.problem}). Try a sharper photo in good light, or enter it by hand.`,
      });
      return;
    }
    const receipt = scanned.receipt;
    if (receipt.merchant) setMerchant(receipt.merchant);
    if (receipt.date && receipt.date <= today) setDate(receipt.date);
    setDraft((prev) => draftFromReceipt(receipt, prev, { decimalSeparator }));
    const suggested = categoryForReceipt(receipt.merchant, receipt.category, categories);
    if (suggested) setCategoryId(suggested);
    setOpenItem(null);
    setShowErrors(false);
    setSaveError(null);
    setScan({ status: 'read', receipt, scansLeft: scanned.scans_left });
  }

  async function scanFrom(from: 'camera' | 'library') {
    // A cancelled scan's result is ignored when it arrives.
    const attempt = ++scanAttempt.current;
    try {
      const photo = await pickReceiptPhoto(from);
      if (!photo) return;
      setScan({ status: 'scanning' });
      const scanned = await scanReceipt(userId, photo);
      if (attempt === scanAttempt.current) applyScan(scanned);
    } catch (e) {
      if (attempt === scanAttempt.current) {
        setScan({ status: 'error', message: friendlyError(e as Error) });
      }
    }
  }

  /** Scans straight away on a fresh form; otherwise asks before replacing what's there. */
  function requestScan(from: 'camera' | 'library') {
    if (hasEnteredDetails(draft, merchant)) setScan({ status: 'confirm', from, previous: scan });
    else void scanFrom(from);
  }

  function cancelScan() {
    scanAttempt.current++;
    setScan((current) => (current.status === 'confirm' ? current.previous : { status: 'idle' }));
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
        source: scan.status === 'read' ? 'photo' : 'manual',
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
          {editing ? null : (
            <ScanReceipt
              state={scan}
              currentTotal={draft.mode === 'items' ? result.totalCents : null}
              onScan={requestScan}
              onConfirm={(from) => void scanFrom(from)}
              onCancel={cancelScan}
            />
          )}
          {/* Locked while a scan is being read: its result replaces these, so typing would be lost. */}
          <View
            style={[styles.formBody, scanning && styles.locked]}
            pointerEvents={scanning ? 'none' : 'auto'}
            accessibilityElementsHidden={scanning}
            importantForAccessibility={scanning ? 'no-hide-descendants' : 'auto'}
          >
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
              <View style={styles.stack}>
                <View style={styles.dateRow}>
                  <Text variant="sectionHeading" style={styles.flex}>
                    Date
                  </Text>
                  <Chip
                    label={formatDate(date, today)}
                    icon="calendar"
                    trailingIcon={choosingDate ? 'chevron-up' : 'chevron-down'}
                    expanded={choosingDate}
                    onPress={() => setChoosingDate(!choosingDate)}
                    accessibilityLabel={`Date: ${formatDate(date, today)}`}
                    accessibilityHint="Opens a calendar"
                  />
                </View>
                {choosingDate ? (
                  <CalendarPicker
                    value={date}
                    max={today}
                    onPick={(picked) => {
                      setDate(picked);
                      setChoosingDate(false);
                    }}
                  />
                ) : null}
              </View>
            </View>

            {shared ? (
              <Section title="Paid by" divided>
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
                    <Chip
                      label="Add person"
                      icon="user-plus"
                      onPress={() => setAddingPerson(true)}
                    />
                  )}
                </View>
                {addingPerson ? (
                  <AddPersonForm onAdd={addPersonToGroup} onCancel={() => setAddingPerson(false)} />
                ) : null}
              </Section>
            ) : null}

            {draft.mode === 'items' ? (
              <Section title="Items" divided>
                <View style={styles.wrap}>
                  <Chip
                    label="Itemized"
                    icon="list"
                    selected
                    onPress={() => update({ mode: 'items' })}
                  />
                  <Chip
                    label="Just a total"
                    icon="hash"
                    selected={false}
                    onPress={() => update({ mode: 'quick' })}
                  />
                </View>
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
                {ADJUSTMENTS.map(({ kind, label }) =>
                  draft[kind] === null ? null : (
                    <AdjustmentRow
                      key={kind}
                      label={label}
                      value={draft[kind] ?? ''}
                      error={visible(kind)}
                      onChange={(value) => update({ [kind]: value })}
                      onRemove={() => update({ [kind]: null })}
                      amountPlaceholder={amountPlaceholder}
                    />
                  ),
                )}
                {ADJUSTMENTS.some(({ kind }) => draft[kind] === null) ? (
                  <View style={styles.wrap}>
                    {ADJUSTMENTS.map(({ kind, label }) =>
                      draft[kind] === null ? (
                        <TextButton
                          key={kind}
                          label={`Add ${label.toLowerCase()}`}
                          icon="plus"
                          onPress={() => update({ [kind]: '' })}
                        />
                      ) : null,
                    )}
                  </View>
                ) : null}
                {ADJUSTMENTS.some(({ kind }) => draft[kind] !== null) ? (
                  <Text variant="small">
                    Tax, tip and discounts are split in proportion to each person’s items.
                  </Text>
                ) : null}
                {scan.status === 'read' &&
                totalCheck(scan.receipt.total_cents, result.totalCents) ? (
                  <FormMessage message={totalCheck(scan.receipt.total_cents, result.totalCents)!} />
                ) : null}
              </Section>
            ) : (
              <Section title="Total" divided>
                <View style={styles.wrap}>
                  <Chip
                    label="Itemized"
                    icon="list"
                    selected={false}
                    onPress={() => update({ mode: 'items' })}
                  />
                  <Chip
                    label="Just a total"
                    icon="hash"
                    selected
                    onPress={() => update({ mode: 'quick' })}
                  />
                </View>
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
                  <View style={styles.stack}>
                    <Text variant="small">How to split</Text>
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
                              placeholderTextColor={colors.placeholder}
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

            <Section title={shared ? 'Category for your share' : 'Category'} divided>
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
              sharedWith={shared ? group.name : null}
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
  const alone = people.everyone.length === 1;
  const quantity = readQuantity(item.quantity);
  const several = quantity !== null && quantity > 1;
  const assignment = effectiveAssignment(item.assignment, quantity, people);
  // Split evenly: everyone to start, then untick people.
  const evenly = assignment.kind === 'all' || assignment.kind === 'custom';
  const sharing = evenly ? assignedTo(assignment, people) : [];
  // One tag per unit ("3 × Soft drink": You, You, You), or null for one tag for the whole line.
  const tags = tagsFor(assignment, quantity, people);
  const label = assignmentLabel(assignment, people, names);
  const itemName = item.name || 'Item';
  // Which unit's tag the dropdown is for; null for the line's single tag.
  const [openTag, setOpenTag] = useState<number | null>(null);
  const tagOpen = open && tags !== null && openTag !== null && openTag < tags.length;

  const choose = (next: Assignment) => {
    onChange({ assignment: next });
    onToggle();
  };

  function toggle(index: number | null) {
    if (open && openTag === index) {
      onToggle();
      return;
    }
    setOpenTag(index);
    if (!open) onToggle();
  }

  function tagOne(index: number, id: string) {
    if (tags) choose(retag(tags, index, id));
  }

  function toggleSharing(id: string) {
    onChange({ assignment: toggleEvenSplit(sharing, id, people) });
  }

  const removeButton = onRemove ? (
    <IconButton icon="trash-2" label={`Remove ${itemName}`} onPress={onRemove} />
  ) : null;

  return (
    <View style={styles.item}>
      {several ? <Text variant="small">Enter the price for all {quantity}.</Text> : null}
      <View style={styles.itemLine}>
        <TextInput
          value={item.quantity}
          onChangeText={(text) => onChange({ quantity: text })}
          placeholder="1"
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={`${itemName} quantity`}
          style={[styles.input, styles.quantityInput]}
        />
        <Text variant="small">×</Text>
        <TextInput
          value={item.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Item"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Item name"
          autoCapitalize="sentences"
          maxLength={200}
          style={[styles.input, styles.flex]}
        />
        <TextInput
          value={item.amount}
          onChangeText={(amount) => onChange({ amount })}
          placeholder={amountPlaceholder}
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          accessibilityLabel={`${itemName} amount`}
          style={[styles.input, styles.amountInput]}
        />
      </View>

      {alone ? (
        <View style={styles.itemLine}>
          <Tag label="You" tone="accent" />
          <View style={styles.flex} />
          {removeButton}
        </View>
      ) : tags ? (
        <>
          <Text variant="small">Who’s each one for?</Text>
          <View style={[styles.wrap, styles.tagRow]}>
            {tags.map((id, index) => (
              <Chip
                key={index}
                label={nameOf(id)}
                tone={id === people.me ? 'you' : 'neutral'}
                trailingIcon={open && openTag === index ? 'chevron-up' : 'chevron-down'}
                onPress={() => toggle(index)}
                expanded={open && openTag === index}
                accessibilityLabel={`${itemName} ${index + 1} of ${tags.length}: ${nameOf(id)}`}
                accessibilityHint="Opens a list of people to choose from"
              />
            ))}
            <View style={styles.flex} />
            {removeButton}
          </View>
        </>
      ) : (
        <View style={styles.itemLine}>
          <Text variant="small">Who’s it for?</Text>
          <Chip
            label={label}
            tone={assignment.kind === 'you' ? 'you' : 'neutral'}
            trailingIcon={open ? 'chevron-up' : 'chevron-down'}
            onPress={() => toggle(null)}
            expanded={open}
            accessibilityLabel={`Who it’s for: ${label}`}
            accessibilityHint="Opens a list of people to choose from"
          />
          <View style={styles.flex} />
          {removeButton}
        </View>
      )}

      {open && tagOpen && tags && openTag !== null ? (
        <View style={styles.dropdown}>
          {[people.me, ...people.everyone.filter((id) => id !== people.me)].map((id) => (
            <DropdownRow
              key={id}
              label={nameOf(id)}
              selected={tags[openTag] === id}
              onPress={() => tagOne(openTag, id)}
            />
          ))}
          <DropdownRow
            label={`Split all ${quantity} evenly`}
            selected={false}
            onPress={() => choose({ kind: 'all' })}
            last
          />
        </View>
      ) : open && !tags ? (
        <View style={styles.dropdown}>
          {assignmentOptions(people, names).map((option, index, options) => (
            <DropdownRow
              key={option.key}
              label={option.label}
              selected={sameAssignment(option.assignment, assignment)}
              onPress={() => choose(option.assignment)}
              last={index === options.length - 1}
            />
          ))}
        </View>
      ) : null}
      {evenly && !alone ? (
        <View style={styles.stack}>
          <View style={styles.wrap}>
            {people.everyone.map((id) => (
              <Chip
                key={id}
                label={nameOf(id)}
                selected={sharing.includes(id)}
                onPress={() => toggleSharing(id)}
              />
            ))}
          </View>
          {sharing.length > 0 ? (
            <Text variant="small">
              {evenSplitMessage({
                people: sharing.map((id) => ({ name: nameOf(id), you: id === people.me })),
                everyone: sharing.length === people.everyone.length,
                quantity: quantity ?? 1,
              })}{' '}
              Tap a name to leave them out or add them back.
            </Text>
          ) : null}
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

const ADJUSTMENTS = [
  { kind: 'tax', label: 'Tax' },
  { kind: 'tip', label: 'Tip' },
  { kind: 'discount', label: 'Discount' },
] as const;

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'read'; receipt: ScannedReceipt; scansLeft: number }
  | { status: 'error'; message: string }
  /** Asking before a scan replaces what's been entered. */
  | { status: 'confirm'; from: 'camera' | 'library'; previous: ScanState };

/** "Scan a receipt": take or choose a photo, then how the draft compares with its total. */
function ScanReceipt({
  state,
  currentTotal,
  onScan,
  onConfirm,
  onCancel,
}: {
  state: ScanState;
  currentTotal: number | null;
  /** Take or choose a photo; asks first if something's been entered. */
  onScan: (from: 'camera' | 'library') => void;
  /** Scan anyway, replacing what's been entered. */
  onConfirm: (from: 'camera' | 'library') => void;
  /** Stop reading, or keep what's been entered. */
  onCancel: () => void;
}) {
  if (state.status === 'confirm') {
    return (
      <View style={styles.stack} accessibilityLiveRegion="polite">
        <Text variant="body">
          Scanning replaces the store, date and items you’ve entered with the receipt’s.
        </Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Keep mine" variant="secondary" onPress={onCancel} />
          </View>
          <View style={styles.flex}>
            <Button label="Scan anyway" onPress={() => onConfirm(state.from)} />
          </View>
        </View>
      </View>
    );
  }
  if (state.status === 'scanning') {
    return (
      <View style={styles.scanRow} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.ink} />
        <Text variant="body" style={styles.flex}>
          Reading your receipt…
        </Text>
        <TextButton label="Cancel" onPress={onCancel} />
      </View>
    );
  }
  const buttons = (
    <View style={styles.wrap}>
      <TextButton
        label={state.status === 'read' ? 'Scan again' : 'Take photo'}
        icon="camera"
        onPress={() => onScan('camera')}
      />
      <TextButton label="Choose photo" icon="image" onPress={() => onScan('library')} />
    </View>
  );
  if (state.status === 'read') {
    const matches = totalCheck(state.receipt.total_cents, currentTotal) === null;
    return (
      <View style={styles.stack}>
        <Text variant="small">
          Filled in from your receipt
          {matches && currentTotal !== null
            ? `, and it matches the total of ${formatCents(state.receipt.total_cents)}`
            : ''}
          . Check each line, then choose who each item is for.
          {state.scansLeft <= 5
            ? ` ${state.scansLeft} ${state.scansLeft === 1 ? 'scan' : 'scans'} left this month.`
            : ''}
        </Text>
        {buttons}
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <Text variant="small">Have the receipt? Scan it to fill this in.</Text>
      {buttons}
      {state.status === 'error' ? <FormMessage message={state.message} /> : null}
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
          placeholderTextColor={colors.placeholder}
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
  sharedWith,
}: {
  totalCents: number | null;
  myShare: number;
  categoryName: string | undefined;
  owed: { from: string; to: string; amountCents: number }[];
  nameOf: (id: string) => string;
  me: string;
  hasErrors: boolean;
  /** The group's name, or null for your Personal group. */
  sharedWith: string | null;
}) {
  if (totalCents === null) {
    return (
      <KeyBlock>
        <Text variant="sectionHeading">Your share</Text>
        <Text variant="body">Add amounts to see how it splits.</Text>
      </KeyBlock>
    );
  }

  // Groups are transparent: everyone in the group sees the whole receipt.
  const privacy = sharedWith
    ? `Everyone in ${sharedWith} can see this receipt and how each share was worked out.`
    : 'Only you can see this expense.';

  return (
    <KeyBlock>
      <Text variant="sectionHeading">Your share</Text>
      <Money
        cents={myShare}
        variant="bigNumber"
        accessibilityLabel={`Your share ${formatCents(myShare)}`}
      />
      {myShare === 0 ? (
        <Text variant="body">Nothing for you</Text>
      ) : categoryName ? (
        <Tag label={categoryName} tone="white" />
      ) : (
        <Text variant="small">Pick a category below</Text>
      )}
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
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  formBody: {
    gap: space.section,
  },
  locked: {
    opacity: 0.4,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
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
  tagRow: {
    alignItems: 'center',
  },
  quantityInput: {
    width: 48,
    textAlign: 'center',
    paddingHorizontal: space.xs,
    fontVariant: ['tabular-nums'],
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
