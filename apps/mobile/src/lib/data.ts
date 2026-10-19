// Supabase reads and writes for groups and expenses. Screens call these instead of building
// queries themselves. Row-level security decides what each query can see: full expense rows
// only for their payer (or whoever entered them), everything else through get_my_shares().
import type { Cents, Debt } from '@spendly/ledger';
import type { PostgrestError } from '@supabase/supabase-js';

import { profileColumns, toForm, type ProfileFields, type ProfileForm } from './profile';
import type { SaveItem } from './split';
import { supabase } from './supabase';

export interface Person {
  id: string;
  displayName: string;
  userId: string | null;
  phone: string | null;
}

export interface Group {
  id: string;
  name: string;
  isPersonal: boolean;
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
  'id, name, is_personal, created_by, created_at, participants(id, display_name, user_id, phone, created_at)';

interface GroupRow {
  id: string;
  name: string;
  is_personal: boolean;
  created_by: string;
  participants: {
    id: string;
    display_name: string;
    user_id: string | null;
    phone: string | null;
    created_at: string;
  }[];
}

/**
 * People in the order they were added. Groups made before participants got distinct
 * timestamps can have ties; the creator then comes first, then a stable order by id.
 */
function toGroup(row: GroupRow): Group {
  const rank = (p: GroupRow['participants'][number]) => (p.user_id === row.created_by ? 0 : 1);
  return {
    id: row.id,
    name: row.name,
    isPersonal: row.is_personal,
    people: [...row.participants]
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || rank(a) - rank(b) || a.id.localeCompare(b.id),
      )
      .map((p) => ({ id: p.id, displayName: p.display_name, userId: p.user_id, phone: p.phone })),
  };
}

/** Every group you're in: shared groups, newest first, then your Personal group. */
export async function fetchGroups(): Promise<Group[]> {
  const rows = unwrap(
    await supabase.from('groups').select(groupColumns).order('created_at', { ascending: false }),
  );
  return rows.map(toGroup).sort((a, b) => Number(a.isPersonal) - Number(b.isPersonal));
}

/** One group you're in. Throws if it doesn't exist or you can't see it. */
export async function fetchGroup(groupId: string): Promise<Group> {
  return toGroup(
    unwrap(await supabase.from('groups').select(groupColumns).eq('id', groupId).single()),
  );
}

export async function createGroup(
  name: string,
  people: { displayName: string; phone: string | null }[],
): Promise<string> {
  return unwrap(
    await supabase.rpc('create_group', {
      p_name: name,
      p_people: people.map((p) => ({ display_name: p.displayName, phone: p.phone })),
    }),
  );
}

/** Adds a name-only person to a group you're in. */
export async function addPerson(
  groupId: string,
  displayName: string,
  phone: string | null,
): Promise<Person> {
  const row = unwrap(
    await supabase
      .from('participants')
      .insert({ group_id: groupId, display_name: displayName, phone })
      .select('id, display_name, user_id, phone')
      .single(),
  );
  return { id: row.id, displayName: row.display_name, userId: row.user_id, phone: row.phone };
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

/** Net balances for every pair that includes you, in one group or all of them. */
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
      p_source: 'manual',
    }),
  );
}

export async function voidExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('void_expense', { p_expense_id: expenseId });
  if (error) throw error;
}

export interface ExpenseSummary {
  id: string;
  groupId: string;
  merchant: string;
  expenseDate: string;
  /** When it was entered; empty for shares of someone else's expense. */
  createdAt: string;
  voided: boolean;
  /** "full": you paid or entered it. "share": someone else paid; you see only your part. */
  view: 'full' | 'share';
  /** The total for full rows; your share for share rows. */
  amountCents: Cents;
}

/**
 * Expenses you can see, newest first, including voided ones: in one group, or in all of them.
 * Ones you paid or entered come in full; ones someone else paid come as your share.
 */
export async function fetchExpenses(
  options: { groupId?: string; limit?: number } = {},
): Promise<ExpenseSummary[]> {
  let fullQuery = supabase
    .from('expenses')
    .select(
      'id, group_id, merchant, expense_date, total_cents, voided_at, created_at, replaces_expense_id',
    )
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  let shareQuery = supabase
    .rpc('get_my_shares')
    .select('expense_id, group_id, merchant, expense_date, amount_cents')
    .order('expense_date', { ascending: false });
  if (options.groupId) {
    fullQuery = fullQuery.eq('group_id', options.groupId);
    shareQuery = shareQuery.eq('group_id', options.groupId);
  }
  // The newest N overall are among the newest N of each list.
  if (options.limit) {
    fullQuery = fullQuery.limit(options.limit);
    shareQuery = shareQuery.limit(options.limit);
  }

  const [full, mine] = await Promise.all([fullQuery, shareQuery]);
  const fullRows = unwrap(full);
  const shareRows = unwrap(mine);

  const seen = new Set(fullRows.map((row) => row.id));
  const replaced = new Set(fullRows.map((row) => row.replaces_expense_id).filter(Boolean));
  const expenses = [
    ...fullRows
      .filter((row) => !replaced.has(row.id))
      .map((row) => ({
        id: row.id,
        groupId: row.group_id,
        merchant: row.merchant,
        expenseDate: row.expense_date,
        createdAt: row.created_at,
        voided: row.voided_at !== null,
        view: 'full' as const,
        amountCents: row.total_cents,
      })),
    ...shareRows
      .filter((row) => !seen.has(row.expense_id))
      .map((row) => ({
        id: row.expense_id,
        groupId: row.group_id,
        merchant: row.merchant,
        expenseDate: row.expense_date,
        // get_my_shares doesn't return when it was entered; the date orders it well enough.
        createdAt: '',
        voided: false,
        view: 'share' as const,
        amountCents: row.amount_cents,
      })),
  ].sort(
    (a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt),
  );
  return options.limit ? expenses.slice(0, options.limit) : expenses;
}

export interface FullExpense {
  view: 'full';
  id: string;
  groupId: string;
  paidBy: string;
  merchant: string;
  expenseDate: string;
  totalCents: Cents;
  categoryId: string | null;
  voidedAt: string | null;
  /** The earlier version this one replaced, if it was saved as an edit. */
  replacesExpenseId: string | null;
  /** The newer version that replaced this one, if it was edited. */
  replacedById: string | null;
  /** Forgiveness is tied to this expense, so it can't be edited. */
  hasForgiveness: boolean;
  items: { id: string; name: string; amountCents: Cents; kind: string; participantIds: string[] }[];
  shares: { participantId: string; amountCents: Cents; categoryOverrideId: string | null }[];
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
  categoryOverrideId: string | null;
  items: { name: string; amountCents: Cents; splitCount: number }[];
}

/** An expense in full if you paid or entered it, otherwise just your share. null if neither. */
export async function fetchExpense(
  expenseId: string,
): Promise<FullExpense | ShareOfExpense | null> {
  const { data, error } = await supabase
    .from('expenses')
    // One string literal, so supabase-js can infer the row type from it.
    .select(
      'id, group_id, paid_by, merchant, expense_date, total_cents, category_id, voided_at, replaces_expense_id, expense_items(id, name, amount_cents, kind, position, item_assignments(participant_id)), shares(participant_id, amount_cents, category_override_id)',
    )
    .eq('id', expenseId)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const [replacement, forgiveness] = await Promise.all([
      supabase.from('expenses').select('id').eq('replaces_expense_id', expenseId).maybeSingle(),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('expense_id', expenseId)
        .eq('kind', 'forgiveness')
        .eq('status', 'confirmed'),
    ]);
    if (replacement.error) throw replacement.error;
    if (forgiveness.error) throw forgiveness.error;
    return {
      view: 'full',
      replacesExpenseId: data.replaces_expense_id,
      replacedById: replacement.data?.id ?? null,
      hasForgiveness: (forgiveness.count ?? 0) > 0,
      id: data.id,
      groupId: data.group_id,
      paidBy: data.paid_by,
      merchant: data.merchant,
      expenseDate: data.expense_date,
      totalCents: data.total_cents,
      categoryId: data.category_id,
      voidedAt: data.voided_at,
      items: [...data.expense_items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: item.id,
          name: item.name,
          amountCents: item.amount_cents,
          kind: item.kind,
          participantIds: item.item_assignments.map((a) => a.participant_id),
        })),
      shares: data.shares.map((share) => ({
        participantId: share.participant_id,
        amountCents: share.amount_cents,
        categoryOverrideId: share.category_override_id,
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
    categoryOverrideId: mine.category_override_id,
    items: items.map((raw) => {
      const item = raw as { name: string; amount_cents: number; split_count: number };
      return { name: item.name, amountCents: item.amount_cents, splitCount: item.split_count };
    }),
  };
}

// Payments -------------------------------------------------------------------

export type PaymentMethod = 'venmo' | 'paypal' | 'cashapp' | 'cash' | 'other';

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
export async function fetchPayments(options: { groupId?: string } = {}): Promise<Payment[]> {
  let query = supabase
    .from('payments')
    .select(
      'id, group_id, from_participant, to_participant, amount_cents, kind, status, method, created_at, decided_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (options.groupId) query = query.eq('group_id', options.groupId);
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

/** "I paid": counts once the person you paid confirms it. */
export async function claimPayment(input: {
  groupId: string;
  to: string;
  amountCents: Cents;
  method: PaymentMethod | null;
}): Promise<void> {
  const { error } = await supabase.rpc('claim_payment', {
    p_group_id: input.groupId,
    p_to: input.to,
    p_amount_cents: input.amountCents,
    ...(input.method ? { p_method: input.method } : {}),
  });
  if (error) throw error;
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
}

/** Venmo, PayPal and Cash App usernames for these accounts (yours and groupmates'). */
export async function fetchHandles(userIds: string[]): Promise<Record<string, PaymentHandles>> {
  if (userIds.length === 0) return {};
  const rows = unwrap(
    await supabase
      .from('profiles')
      .select('id, venmo_username, paypal_username, cashapp_tag')
      .in('id', userIds),
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      { venmo: row.venmo_username, paypal: row.paypal_username, cashtag: row.cashapp_tag },
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
        'id, merchant, expense_date, created_at, voided_at, paid_by, shares(participant_id, amount_cents), expense_items(name, kind, position, item_assignments(participant_id))',
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
