-- Privacy (Rule 5) and access control.
--
-- - Nothing is readable without signing in: anon has no grants at all.
-- - Full expense rows, items, assignments and shares are readable only by the payer
--   (and whoever entered the expense). Others use get_my_shares().
-- - Ledger tables are read-only for the app. Writes go through save_expense / void_expense
--   (and the payment functions in Step 6), which run as the table owner.
-- - Payment links, text consents, messages and inbound emails are for Edge Functions only.

-- Grants --------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- Edge Functions use service_role. It can add ledger rows but never rewrite them.
revoke update, delete, truncate
  on public.expenses, public.expense_items, public.item_assignments, public.shares, public.payments
  from service_role;

-- Ownership columns default to the caller, and the app can't set them itself.
alter table public.groups alter column created_by set default auth.uid();
alter table public.categories alter column user_id set default auth.uid();
alter table public.budgets alter column user_id set default auth.uid();
alter table public.push_tokens alter column user_id set default auth.uid();

grant select on
  public.profiles, public.groups, public.participants, public.categories, public.budgets,
  public.expenses, public.expense_items, public.item_assignments, public.shares, public.payments,
  public.receipt_extractions, public.verified_emails, public.push_tokens
  to authenticated;

grant update (display_name, venmo_username, paypal_username, cashapp_tag) on public.profiles to authenticated;
grant insert (name), update (name) on public.groups to authenticated;
-- user_id can be set on insert (only to yourself, see policy) but never changed, so nobody can
-- take over a name-only participant's shares.
grant insert (group_id, display_name, user_id, phone), update (display_name, phone)
  on public.participants to authenticated;
grant insert (name), update (name), delete on public.categories to authenticated;
grant insert (category_id, month, amount_cents), update (amount_cents), delete
  on public.budgets to authenticated;
grant insert (token), delete on public.push_tokens to authenticated;

-- Helpers for policies ------------------------------------------------------
-- Security definer so policies can look at other tables without recursing into their RLS.
-- They live in `private`, which the API doesn't expose.

grant usage on schema private to authenticated;

create function private.is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.participants
    where group_id = p_group_id and user_id = (select auth.uid())
  );
$$;

create function private.is_my_participant(p_participant_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.participants
    where id = p_participant_id and user_id = (select auth.uid())
  );
$$;

-- The payer's account, or whoever entered the expense.
create function private.can_see_expense(p_expense_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses e
    join public.participants payer on payer.id = e.paid_by
    where e.id = p_expense_id
      and (e.created_by = (select auth.uid()) or payer.user_id = (select auth.uid()))
  );
$$;

create function private.can_see_item(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_see_expense(expense_id) from public.expense_items where id = p_item_id;
$$;

create function private.shares_group_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.participants mine
    join public.participants theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- Members add name-only people. A group's creator adds themselves right after creating it.
-- Nobody can add people to a Personal group.
create function private.can_add_participant(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and not g.is_personal
      and (
        (p_user_id is null and private.is_group_member(g.id))
        or (p_user_id = (select auth.uid()) and g.created_by = (select auth.uid()))
      )
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_group_member(uuid),
  private.is_my_participant(uuid),
  private.can_see_expense(uuid),
  private.can_see_item(uuid),
  private.shares_group_with(uuid),
  private.can_add_participant(uuid, uuid)
  to authenticated;

-- Row-level security ----------------------------------------------------------
-- Enabled on every table. Tables without policies (share_links, sms_consents,
-- outbound_messages, inbound_emails) are closed to everyone except service_role.

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.participants enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.item_assignments enable row level security;
alter table public.shares enable row level security;
alter table public.payments enable row level security;
alter table public.share_links enable row level security;
alter table public.sms_consents enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.receipt_extractions enable row level security;
alter table public.inbound_emails enable row level security;
alter table public.verified_emails enable row level security;
alter table public.push_tokens enable row level security;

-- profiles: yours, plus people you share a group with (for names and payment usernames).
create policy "Read own and groupmates' profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_group_with(id));
create policy "Update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- groups
create policy "Read groups you're in or created" on public.groups
  for select to authenticated
  using (private.is_group_member(id) or created_by = (select auth.uid()));
create policy "Create groups" on public.groups
  for insert to authenticated
  with check (created_by = (select auth.uid()) and not is_personal);
create policy "Rename groups you're in" on public.groups
  for update to authenticated
  using (private.is_group_member(id))
  with check (private.is_group_member(id));

-- participants
create policy "Read people in your groups" on public.participants
  for select to authenticated
  using (
    private.is_group_member(group_id)
    or group_id in (select id from public.groups where created_by = (select auth.uid()))
  );
create policy "Add people to your groups" on public.participants
  for insert to authenticated
  with check (private.can_add_participant(group_id, user_id));
create policy "Edit people in your groups" on public.participants
  for update to authenticated
  using (private.is_group_member(group_id))
  with check (private.is_group_member(group_id));

-- categories and budgets: owner only.
create policy "Own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Own budgets" on public.budgets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Ledger: read-only, and only for the payer or whoever entered the expense.
create policy "Payer reads expenses" on public.expenses
  for select to authenticated
  using (private.can_see_expense(id));
create policy "Payer reads items" on public.expense_items
  for select to authenticated
  using (private.can_see_expense(expense_id));
create policy "Payer reads assignments" on public.item_assignments
  for select to authenticated
  using (private.can_see_item(item_id));
create policy "Payer reads shares" on public.shares
  for select to authenticated
  using (private.can_see_expense(expense_id));

-- payments: the two people involved, and whoever recorded it.
create policy "Read your payments" on public.payments
  for select to authenticated
  using (
    private.is_my_participant(from_participant)
    or private.is_my_participant(to_participant)
    or recorded_by = (select auth.uid())
  );

-- Owner-only tables.
create policy "Own receipt extractions" on public.receipt_extractions
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Own verified emails" on public.verified_emails
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
