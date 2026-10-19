// Supabase reads and writes for groups and expenses. Screens call these instead of building
// queries themselves. Row-level security decides what each query can see: groups are
// transparent, so every expense in your groups in full, except other people's categories.
import type { Cents, Debt } from '@spendly/ledger';
import type { PostgrestError } from '@supabase/supabase-js';

import type { BudgetRow, SpendingItem } from './budget';
import type { BillLine } from './breakdown';
import { toSummaries, type ExpenseSummary } from './expenseList';
import type { KnownPerson } from './oneOff';
import { profileColumns, toForm, type ProfileFields, type ProfileForm } from './profile';
import type { SaveItem } from './split';
import { supabase } from './supabase';

export interface Person {
  id: string;
  displayName: string;
  userId: string | null;
  phone: string | null;
  /** Their Spendly username, when they have an account in this group. */
  username: string | null;
  /** A pending invite for an account to become this person. */
  invite: { id: string; username: string | null } | null;
}

export interface Group {
  id: string;
  name: string;
  isPersonal: boolean;
  /** A group for a single outing, kept out of group lists. */
  isOneOff: boolean;
  /** In the order they were added; the creator comes first. */
  people: Person[];
}

export interface Category {
  id: string;
  name: string;
}

/** An error whose message is already written for the person using the app. */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}

export function friendlyError(error: PostgrestError | Error | null | undefined): string {
  if (!error) return 'Something went wrong. Try again.';
  if (error instanceof UserFacingError) return error.message;
  const code = 'code' in error ? error.code : undefined;
  // Our database functions raise plain-English messages with these codes.
  if (code === '22023' || code === 'P0001' || code === 'P0002') return error.message;
  if (code === '23514') {
    // A check constraint, e.g. a name that's too long. Its raw message isn't for people.
    return error.message.includes('violates check constraint')
      ? 'Some details aren’t valid. Check the names and amounts.'
      : error.message;
  }
  if (code === '42501') return 'You don’t have access to that.';
  return 'Couldn’t reach the server. Check your connection and try again.';
}

function unwrap<R extends { data: unknown; error: PostgrestError | null }>(
  result: R,
): NonNullable<R['data']> {
  if (result.error) throw result.error;
  if (result.data === null || result.data === undefined) throw new Error('No data');
  return result.data as NonNullable<R['data']>;
}

const groupColumns =
  'id, name, is_personal, is_one_off, created_by, created_at, participants(id, display_name, user_id, phone, created_at, group_invites(id, status, invited_user_id))';

interface GroupRow {
  id: string;
  name: string;
  is_personal: boolean;
  is_one_off: boolean;
  created_by: string;
  participants: {
    id: string;
    display_name: string;
    user_id: string | null;
    phone: string | null;
    created_at: string;
    group_invites: { id: string; status: string; invited_user_id: string }[];
  }[];
}

/**
 * People in the order they were added. Groups made before participants got distinct
 * timestamps can have ties; the creator then comes first, then a stable order by id.
 */
function toGroup(row: GroupRow, usernames: ReadonlyMap<string, string>): Group {
  const rank = (p: GroupRow['participants'][number]) => (p.user_id === row.created_by ? 0 : 1);
  return {
    id: row.id,
    name: row.name,
    isPersonal: row.is_personal,
    isOneOff: row.is_one_off,
    people: [...row.participants]
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || rank(a) - rank(b) || a.id.localeCompare(b.id),
      )
      .map((p) => {
        const invite = p.group_invites.find((i) => i.status === 'pending');
        return {
          id: p.id,
          displayName: p.display_name,
          userId: p.user_id,
          phone: p.phone,
          username: p.user_id ? (usernames.get(p.user_id) ?? null) : null,
          invite: invite
            ? { id: invite.id, username: usernames.get(invite.invited_user_id) ?? null }
            : null,
        };
      }),
  };
}

/** Usernames for the accounts in these groups, including people invited to them. */
async function usernamesFor(rows: readonly GroupRow[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const p of row.participants) {
      if (p.user_id) ids.add(p.user_id);
      for (const i of p.group_invites) if (i.status === 'pending') ids.add(i.invited_user_id);
    }
  }
  return fetchUsernames([...ids]);
}

async function fetchUsernames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = unwrap(await supabase.from('profiles').select('id, username').in('id', userIds));
  return new Map(rows.map((r) => [r.id, r.username]));
}

/** Every group you're in: shared groups, newest first, then your Personal group. */
export async function fetchGroups(): Promise<Group[]> {
  const rows = unwrap(
    await supabase.from('groups').select(groupColumns).order('created_at', { ascending: false }),
  );
  const usernames = await usernamesFor(rows);
  return rows
    .map((row) => toGroup(row, usernames))
    .sort((a, b) => Number(a.isPersonal) - Number(b.isPersonal));
}

/** One group you're in. Throws if it doesn't exist or you can't see it. */
export async function fetchGroup(groupId: string): Promise<Group> {
  const row = unwrap(await supabase.from('groups').select(groupColumns).eq('id', groupId).single());
  return toGroup(row, await usernamesFor([row]));
}

export async function createGroup(
  name: string,
  people: { displayName: string; phone: string | null; inviteUserId?: string | null }[],
  options: { oneOff?: boolean } = {},
): Promise<string> {
  return unwrap(
    await supabase.rpc('create_group', {
      p_name: name,
      p_people: people.map((p) => ({
        display_name: p.displayName,
        phone: p.phone,
        invite_user_id: p.inviteUserId ?? null,
      })),
      p_one_off: options.oneOff ?? false,
    }),
  );
}

/** Renames a group you're in. */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.from('groups').update({ name }).eq('id', groupId);
  if (error) throw error;
}

/**
 * Everyone in your groups except you, every copy (one per group), for suggesting people to
 * split with. Merge copies with dedupePeople.
 */
export async function fetchKnownPeople(userId: string): Promise<KnownPerson[]> {
  const rows = unwrap(
    await supabase
      .from('participants')
      .select('display_name, phone, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(300),
  );
  const others = rows.filter((row) => row.user_id !== userId);
  const usernames = await fetchUsernames([
    ...new Set(others.map((r) => r.user_id).filter((id): id is string => id !== null)),
  ]);
  return others.map((row) => ({
    displayName: row.display_name,
    phone: row.phone,
    addedAt: row.created_at,
    userId: row.user_id,
    username: row.user_id ? (usernames.get(row.user_id) ?? null) : null,
  }));
}

/** Saves a phone number for someone in a group you're in. */
export async function updatePersonPhone(participantId: string, phone: string): Promise<void> {
  const { error } = await supabase.from('participants').update({ phone }).eq('id', participantId);
  if (error) throw error;
}

/** Adds a person to a group you're in, and invites an account to be them if one is given. */
export async function addPerson(
  groupId: string,
  displayName: string,
  phone: string | null,
  inviteUserId: string | null = null,
): Promise<string> {
  return unwrap(
    await supabase.rpc('add_person', {
      p_group_id: groupId,
      p_display_name: displayName,
      ...(phone ? { p_phone: phone } : {}),
      ...(inviteUserId ? { p_invite_user_id: inviteUserId } : {}),
    }),
  );
}

export async function fetchCategories(userId: string): Promise<Category[]> {
  return unwrap(
    await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at')
      .order('name'),
  );
}

export async function fetchProfile(userId: string): Promise<ProfileForm> {
  const row = unwrap(
    await supabase.from('profiles').select(profileColumns).eq('id', userId).single(),
  );
  return toForm(row);
}

/** Saves your editable profile fields. Validate them with validateProfile first. */
export async function updateProfile(userId: string, values: ProfileFields): Promise<void> {
  const { error } = await supabase.from('profiles').update(values).eq('id', userId);
  if (error?.code === '23505')
    throw new UserFacingError('That username was just taken. Try another.');
  if (error) throw error;
}

function categoryError(error: PostgrestError): Error {
  if (error.code === '23505') {
    return new UserFacingError('You already have a category with that name.');
  }
  if (error.code === '23503') {
    return new UserFacingError(
      'Some expenses use this category, so it can’t be deleted. Rename it instead.',
    );
  }
  return error;
}

/** Adds one of your own categories. Validate the name with validateCategoryName first. */
export async function createCategory(name: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name })
    .select('id, name')
    .single();
  if (error) throw categoryError(error);
  return data;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);
  if (error) throw categoryError(error);
}

/** Deletes a category nothing uses. One that expenses use can't be deleted. */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw categoryError(error);
}

/** Net balances for every pair in your groups (groups are transparent), in one or all of them. */
export async function fetchBalances(groupId?: string): Promise<(Debt & { groupId: string })[]> {
  let query = supabase.rpc('balances');
  if (groupId) query = query.eq('group_id', groupId);
  const rows = unwrap(await query);
  return rows.map((row) => ({
    groupId: row.group_id,
    from: row.from_participant,
    to: row.to_participant,
    amountCents: row.amount_cents,
  }));
}

export interface SaveExpenseInput {
  groupId: string;
  paidBy: string;
  merchant: string;
  expenseDate: string;
  totalCents: Cents;
  items: SaveItem[];
  shares: { participant_id: string; amount_cents: Cents; category_override_id?: string }[];
  categoryId: string | null;
  /** Set when editing: the expense this one replaces, which is voided in the same save. */
  replacesExpenseId?: string;
  /** "photo" when it was filled in from a scanned receipt. */
  source?: 'manual' | 'photo';
}

/** Saves through save_expense, which checks everything adds up. Returns the new expense id. */
export async function saveExpense(input: SaveExpenseInput): Promise<string> {
  return unwrap(
    await supabase.rpc('save_expense', {
      p_group_id: input.groupId,
      p_paid_by: input.paidBy,
      p_merchant: input.merchant,
      p_expense_date: input.expenseDate,
      p_total_cents: input.totalCents,
      p_shares: input.shares,
      p_items: input.items,
      ...(input.categoryId ? { p_category_id: input.categoryId } : {}),
      ...(input.replacesExpenseId ? { p_replaces_expense_id: input.replacesExpenseId } : {}),
      p_source: input.source ?? 'manual',
    }),
  );
}

export async function voidExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('void_expense', { p_expense_id: expenseId });
  if (error) throw error;
}

export type { ExpenseSummary } from './expenseList';

/**
 * Expenses you can see, newest first, including voided ones: in one group, or in all of them.
 * Groups are transparent, so every expense in them comes in full, with your share marked.
 */
export async function fetchExpenses(
  options: { groupId?: string; limit?: number } = {},
): Promise<ExpenseSummary[]> {
  let query = supabase
    .from('expenses')
    .select(
      'id, group_id, merchant, expense_date, total_cents, voided_at, created_at, replaces_expense_id, shares(amount_cents, participants(user_id))',
    )
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (options.groupId) query = query.eq('group_id', options.groupId);
  if (options.limit) query = query.limit(options.limit);

  const [rows, session] = await Promise.all([query, supabase.auth.getSession()]);
  return toSummaries(unwrap(rows), session.data.session?.user.id);
}

export interface FullExpense {
  view: 'full';
  id: string;
  groupId: string;
  paidBy: string;
  merchant: string;
  expenseDate: string;
  totalCents: Cents;
  voidedAt: string | null;
  /** The earlier version this one replaced, if it was saved as an edit. */
  replacesExpenseId: string | null;
  /** The newer version that replaced this one, if it was edited. */
  replacedById: string | null;
  /** Forgiveness is tied to this expense, so it can't be edited. */
  hasForgiveness: boolean;
  /** Who entered it. They and the payer can edit or void it. */
  createdBy: string;
  /**
   * Your category for it: the expense's if you paid, otherwise how you filed your share (or the
   * category set when it was saved). Only you see it; other people's categories stay private.
   */
  myCategoryId: string | null;
  items: {
    id: string;
    name: string;
    amountCents: Cents;
    kind: string;
    quantity: number;
    participantIds: string[];
    /** Matching participantIds: how many of the quantity each had (all 1 for an even split). */
    units: number[];
    /** Tagged one by one, rather than split evenly. */
    byUnits: boolean;
  }[];
  shares: { participantId: string; amountCents: Cents }[];
}

export interface ShareOfExpense {
  view: 'share';
  id: string;
  groupId: string;
  paidBy: string;
  payerName: string;
  merchant: string;
  expenseDate: string;
  amountCents: Cents;
  /** Your category for your share: how you filed it, else the one set when it was saved. */
  categoryId: string | null;
  items: {
    name: string;
    amountCents: Cents;
    quantity: number;
    /** How many people the item is split between. */
    splitCount: number;
    /** Tagged one by one: how many of the quantity were yours, out of all of them. */
    myUnits: number;
    totalUnits: number;
  }[];
}

/** An expense in full if you paid or entered it, otherwise just your share. null if neither. */
export async function fetchExpense(
  expenseId: string,
): Promise<FullExpense | ShareOfExpense | null> {
  const { data, error } = await supabase
    .from('expenses')
    // One string literal, so supabase-js can infer the row type from it.
    .select(
      'id, group_id, paid_by, created_by, merchant, expense_date, total_cents, voided_at, replaces_expense_id, expense_items(id, name, amount_cents, kind, position, quantity, by_units, item_assignments(participant_id, units)), shares(participant_id, amount_cents)',
    )
    .eq('id', expenseId)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const [replacement, forgiveness, mine] = await Promise.all([
      supabase.from('expenses').select('id').eq('replaces_expense_id', expenseId).maybeSingle(),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('expense_id', expenseId)
        .eq('kind', 'forgiveness')
        .eq('status', 'confirmed'),
      supabase.rpc('my_category_for', { p_expense_id: expenseId }),
    ]);
    if (replacement.error) throw replacement.error;
    if (forgiveness.error) throw forgiveness.error;
    if (mine.error) throw mine.error;
    return {
      view: 'full',
      replacesExpenseId: data.replaces_expense_id,
      replacedById: replacement.data?.id ?? null,
      hasForgiveness: (forgiveness.count ?? 0) > 0,
      createdBy: data.created_by,
      myCategoryId: mine.data ?? null,
      id: data.id,
      groupId: data.group_id,
      paidBy: data.paid_by,
      merchant: data.merchant,
      expenseDate: data.expense_date,
      totalCents: data.total_cents,
      voidedAt: data.voided_at,
      items: [...data.expense_items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: item.id,
          name: item.name,
          amountCents: item.amount_cents,
          kind: item.kind,
          quantity: item.quantity,
          participantIds: item.item_assignments.map((a) => a.participant_id),
          units: item.item_assignments.map((a) => a.units),
          byUnits: item.by_units,
        })),
      shares: data.shares.map((share) => ({
        participantId: share.participant_id,
        amountCents: share.amount_cents,
      })),
    };
  }

  const { data: mine, error: shareError } = await supabase
    .rpc('get_my_shares')
    .eq('expense_id', expenseId)
    .maybeSingle();
  if (shareError) throw shareError;
  if (!mine) return null;
  const items = Array.isArray(mine.items) ? mine.items : [];
  return {
    view: 'share',
    id: mine.expense_id,
    groupId: mine.group_id,
    paidBy: mine.paid_by,
    payerName: mine.payer_name,
    merchant: mine.merchant,
    expenseDate: mine.expense_date,
    amountCents: mine.amount_cents,
    categoryId: mine.category_id,
    items: items.map((raw) => {
      const item = raw as {
        name: string;
        amount_cents: number;
        quantity?: number;
        split_count: number;
        my_units?: number;
        total_units?: number;
      };
      return {
        name: item.name,
        amountCents: item.amount_cents,
        quantity: item.quantity ?? 1,
        splitCount: item.split_count,
        myUnits: item.my_units ?? 1,
        totalUnits: item.total_units ?? item.split_count,
      };
    }),
  };
}

// Payments -------------------------------------------------------------------

export type PaymentMethod = 'venmo' | 'paypal' | 'cashapp' | 'zelle' | 'cash' | 'other';

export interface Payment {
  id: string;
  groupId: string;
  from: string;
  to: string;
  amountCents: Cents;
  kind: 'payment' | 'forgiveness';
  status: 'claimed' | 'confirmed' | 'rejected';
  method: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Payments you're part of, newest first. Row-level security limits them to yours. */
export async function fetchPayments(
  options: { groupId?: string; status?: Payment['status'] } = {},
): Promise<Payment[]> {
  let query = supabase
    .from('payments')
    .select(
      'id, group_id, from_participant, to_participant, amount_cents, kind, status, method, created_at, decided_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (options.groupId) query = query.eq('group_id', options.groupId);
  if (options.status) query = query.eq('status', options.status);
  return unwrap(await query).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    from: row.from_participant,
    to: row.to_participant,
    amountCents: row.amount_cents,
    kind: row.kind as Payment['kind'],
    status: row.status as Payment['status'],
    method: row.method,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  }));
}

/**
 * Records a repayment that counts immediately: one you received, or one you made to someone
 * without the app.
 */
export async function recordPayment(input: {
  groupId: string;
  from: string;
  to: string;
  amountCents: Cents;
  method: PaymentMethod | null;
}): Promise<void> {
  const { error } = await supabase.rpc('record_payment', {
    p_group_id: input.groupId,
    p_from: input.from,
    p_to: input.to,
    p_amount_cents: input.amountCents,
    ...(input.method ? { p_method: input.method } : {}),
  });
  if (error) throw error;
}

/** "I paid": counts once the person you paid confirms it. They get a push about it. */
export async function claimPayment(input: {
  groupId: string;
  to: string;
  amountCents: Cents;
  method: PaymentMethod | null;
}): Promise<void> {
  const paymentId = unwrap(
    await supabase.rpc('claim_payment', {
      p_group_id: input.groupId,
      p_to: input.to,
      p_amount_cents: input.amountCents,
      ...(input.method ? { p_method: input.method } : {}),
    }),
  );
  // Best effort: the claim is saved either way, and shows in their app.
  void supabase.functions.invoke('notify-claim', { body: { payment_id: paymentId } });
}

/** "Got it" or "Didn't get it" on a claim made to you. */
export async function decidePayment(paymentId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_payment', {
    p_payment_id: paymentId,
    p_accept: accept,
  });
  if (error) throw error;
}

/** Forgives up to what someone owes you in a group. */
export async function forgiveDebt(
  groupId: string,
  debtor: string,
  amountCents: Cents,
): Promise<void> {
  const { error } = await supabase.rpc('forgive_debt', {
    p_group_id: groupId,
    p_debtor: debtor,
    p_amount_cents: amountCents,
  });
  if (error) throw error;
}

export interface PaymentHandles {
  venmo: string | null;
  paypal: string | null;
  cashtag: string | null;
  /** The email or US phone number their Zelle uses. */
  zelle: string | null;
}

/** Venmo, PayPal, Cash App and Zelle details for these accounts (yours and groupmates'). */
export async function fetchHandles(userIds: string[]): Promise<Record<string, PaymentHandles>> {
  if (userIds.length === 0) return {};
  const rows = unwrap(
    await supabase
      .from('profiles')
      .select('id, venmo_username, paypal_username, cashapp_tag, zelle_contact')
      .in('id', userIds),
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        venmo: row.venmo_username,
        paypal: row.paypal_username,
        cashtag: row.cashapp_tag,
        zelle: row.zelle_contact,
      },
    ]),
  );
}

/** One expense between you and one other person, from your side. */
export interface PairExpense {
  id: string;
  merchant: string;
  expenseDate: string;
  voided: boolean;
  /** "theyOwe": you paid and they have a share. "iOwe": they paid and you have a share. */
  direction: 'theyOwe' | 'iOwe';
  amountCents: Cents;
  /** The items the owing person had a part in. */
  itemNames: string[];
  /** The whole bill, for showing how the owing person's part was worked out. */
  totalCents: Cents | null;
  /** Who owes on it: them if you paid, you if they did. */
  owing: string;
  lines: BillLine[];
}

/** Expenses behind the balance between you (`me`) and `them` in a group, newest first. */
export async function fetchPairExpenses(
  groupId: string,
  me: string,
  them: string,
): Promise<PairExpense[]> {
  const [full, mine] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        'id, merchant, expense_date, created_at, voided_at, paid_by, total_cents, shares(participant_id, amount_cents), expense_items(name, kind, position, amount_cents, quantity, by_units, item_assignments(participant_id, units))',
      )
      .eq('group_id', groupId)
      .in('paid_by', [me, them])
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .rpc('get_my_shares')
      .select('expense_id, merchant, expense_date, amount_cents, items')
      .eq('group_id', groupId)
      .eq('paid_by', them),
  ]);

  const result: PairExpense[] = [];
  for (const row of unwrap(full)) {
    const owing = row.paid_by === me ? them : me;
    const share = row.shares.find((s) => s.participant_id === owing);
    if (!share || share.amount_cents === 0) continue;
    result.push({
      id: row.id,
      merchant: row.merchant,
      expenseDate: row.expense_date,
      voided: row.voided_at !== null,
      direction: row.paid_by === me ? 'theyOwe' : 'iOwe',
      amountCents: share.amount_cents,
      itemNames: [...row.expense_items]
        .filter(
          (i) => i.kind === 'item' && i.item_assignments.some((a) => a.participant_id === owing),
        )
        .sort((a, b) => a.position - b.position)
        .map((i) => i.name),
      totalCents: row.total_cents,
      owing,
      lines: [...row.expense_items]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          name: i.name,
          amountCents: i.amount_cents,
          kind: i.kind,
          quantity: i.quantity,
          participantIds: i.item_assignments.map((a) => a.participant_id),
          units: i.item_assignments.map((a) => a.units),
          byUnits: i.by_units,
        })),
    });
  }

  const seen = new Set(result.map((e) => e.id));
  for (const row of unwrap(mine)) {
    if (seen.has(row.expense_id)) continue;
    const items = Array.isArray(row.items) ? (row.items as { name: string }[]) : [];
    result.push({
      id: row.expense_id,
      merchant: row.merchant,
      expenseDate: row.expense_date,
      voided: false,
      direction: 'iOwe',
      amountCents: row.amount_cents,
      itemNames: items.map((i) => i.name),
      totalCents: null,
      owing: me,
      lines: [],
    });
  }
  return result.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
}

/** The group a participant belongs to. */
export async function fetchGroupOf(participantId: string): Promise<Group> {
  const row = unwrap(
    await supabase.from('participants').select('group_id').eq('id', participantId).single(),
  );
  return fetchGroup(row.group_id);
}

// Usernames and invites -------------------------------------------------------

export interface FoundUser {
  userId: string;
  displayName: string;
  username: string;
}

/** The account with exactly this username (ignoring case and a leading @), or null. */
export async function findUser(username: string): Promise<FoundUser | null> {
  const { data, error } = await supabase.rpc('find_user', { p_username: username }).maybeSingle();
  if (error) throw error;
  return data
    ? { userId: data.user_id, displayName: data.display_name, username: data.username }
    : null;
}

/** Whether a username is free for you. Your own current one counts as free. */
export async function usernameAvailable(username: string): Promise<boolean> {
  return unwrap(await supabase.rpc('username_available', { p_username: username }));
}

/** Invites an account to be this person in their group. */
export async function inviteToGroup(participantId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('invite_to_group', {
    p_participant_id: participantId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function cancelInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

/** Accepts or declines an invite sent to you. Returns the group's id. */
export async function respondToInvite(inviteId: string, accept: boolean): Promise<string> {
  return unwrap(
    await supabase.rpc('respond_to_invite', { p_invite_id: inviteId, p_accept: accept }),
  );
}

export interface Invite {
  id: string;
  groupId: string;
  groupName: string;
  invitedByName: string;
  invitedByUsername: string;
  addedAs: string;
  createdAt: string;
}

/** Your pending invites, newest first. */
export async function fetchMyInvites(): Promise<Invite[]> {
  return unwrap(await supabase.rpc('my_invites')).map((row) => ({
    id: row.invite_id,
    groupId: row.group_id,
    groupName: row.group_name,
    invitedByName: row.invited_by_name,
    invitedByUsername: row.invited_by_username,
    addedAs: row.added_as,
    createdAt: row.created_at,
  }));
}

// Budgets ----------------------------------------------------------------------

/** Your budget rows; each applies from its month on, until the next row for that category. */
export async function fetchBudgets(userId: string): Promise<BudgetRow[]> {
  return unwrap(
    await supabase
      .from('budgets')
      .select('category_id, month, amount_cents')
      .eq('user_id', userId)
      .order('month'),
  ).map((row) => ({
    categoryId: row.category_id,
    month: row.month,
    amountCents: row.amount_cents,
  }));
}

/** Sets your budget for a category from this month on; null removes it from this month on. */
export async function setBudget(
  categoryId: string,
  month: string,
  amountCents: Cents | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_budget', {
    p_category_id: categoryId,
    p_month: month,
    ...(amountCents === null ? {} : { p_amount_cents: amountCents }),
  });
  if (error) throw error;
}

/** What counts as your spending in a month: your shares and debts you forgave. */
export async function fetchSpendingItems(month: string): Promise<SpendingItem[]> {
  return unwrap(await supabase.rpc('my_spending_items', { p_month: month })).map((row) => ({
    itemId: row.item_id,
    expenseId: row.expense_id,
    merchant: row.merchant,
    expenseDate: row.expense_date,
    categoryId: row.category_id,
    amountCents: row.amount_cents,
    totalCents: row.total_cents,
    paidByName: row.paid_by_name,
    youPaid: row.you_paid,
    isForgiveness: row.is_forgiveness,
  }));
}

/** Files your share of someone else's expense under one of your categories (null clears it). */
export async function setShareCategory(
  expenseId: string,
  categoryId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_share_category', {
    p_expense_id: expenseId,
    ...(categoryId ? { p_category_id: categoryId } : {}),
  });
  if (error) throw error;
}

// Payment links and notes from the payment page ---------------------------------------

/** A new private payment link token for someone in your group. Shown once; only its hash is kept. */
export async function createShareLink(participantId: string): Promise<string> {
  return unwrap(await supabase.rpc('create_share_link', { p_participant_id: participantId }));
}

/** Stops every payment link you've sent this person. */
export async function revokeShareLinks(participantId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_share_links', { p_participant_id: participantId });
  if (error) throw error;
}

/** How many of your payment links for this person still work. */
export async function fetchActiveShareLinks(participantId: string): Promise<number> {
  return unwrap(await supabase.rpc('active_share_links', { p_participant_id: participantId }));
}

/** "Something looks wrong", sent to you from a payment link. */
export interface ProblemReport {
  id: string;
  groupId: string;
  /** The participant who sent it. */
  from: string;
  message: string;
  createdAt: string;
}

/** Notes sent to you that you haven't dismissed, newest first. */
export async function fetchProblemReports(): Promise<ProblemReport[]> {
  const rows = unwrap(
    await supabase
      .from('problem_reports')
      .select('id, group_id, from_participant, message, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false }),
  );
  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    from: row.from_participant,
    message: row.message,
    createdAt: row.created_at,
  }));
}

export async function resolveProblem(reportId: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_problem', { p_report_id: reportId });
  if (error) throw error;
}

/** After how many days claims to you confirm themselves; null when off (the default). */
export async function fetchAutoConfirmDays(userId: string): Promise<number | null> {
  return unwrap(
    await supabase.from('profiles').select('auto_confirm_days').eq('id', userId).single(),
  ).auto_confirm_days;
}

export async function setAutoConfirmDays(userId: string, days: number | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ auto_confirm_days: days })
    .eq('id', userId);
  if (error) throw error;
}
