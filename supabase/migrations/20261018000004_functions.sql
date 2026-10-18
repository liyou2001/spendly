-- Ledger functions. They run as the table owner (security definer) so they can write
-- append-only tables and read across privacy rules, and each one checks the caller itself.
-- The math matches packages/ledger: computeShares makes the shares the app sends to
-- save_expense, and balances() / my_spending() match computeBalances + netBalances and
-- spendingByCategory.

-- Signup ----------------------------------------------------------------------

-- Every new user gets a profile, a Personal group with themselves in it, and default categories.
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  new_display_name text := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Me'
  ), 80);
  personal_group_id uuid;
begin
  insert into public.profiles (id, display_name) values (new.id, new_display_name);

  insert into public.groups (name, created_by, is_personal)
    values ('Personal', new.id, true)
    returning id into personal_group_id;
  insert into public.participants (group_id, display_name, user_id)
    values (personal_group_id, new_display_name, new.id);

  insert into public.categories (user_id, name)
    select new.id, name
    from unnest(array['Rent', 'Groceries', 'Dining', 'Transport', 'Fun', 'Other']) as name;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Voiding -------------------------------------------------------------------

-- Voids an expense the caller paid for or entered. Shared by void_expense and save_expense.
create function private.void_expense_for_caller(p_expense_id uuid)
returns public.expenses
language plpgsql security definer set search_path = ''
as $$
declare
  expense public.expenses;
begin
  select e.* into expense
  from public.expenses e
  join public.participants payer on payer.id = e.paid_by
  where e.id = p_expense_id
    and (e.created_by = auth.uid() or payer.user_id = auth.uid())
  for update of e;

  if not found then
    -- Same message whether it doesn't exist or isn't yours, so this can't probe for expenses.
    raise exception 'Expense % not found', p_expense_id using errcode = 'no_data_found';
  end if;
  if expense.voided_at is not null then
    raise exception 'Expense % is already voided', p_expense_id using errcode = 'invalid_parameter_value';
  end if;

  update public.expenses
    set voided_at = now(), voided_by = auth.uid()
    where id = p_expense_id
    returning * into expense;
  return expense;
end;
$$;

-- Marks an expense voided. It stays in history; it just stops counting.
create function public.void_expense(p_expense_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  perform private.void_expense_for_caller(p_expense_id);
end;
$$;

-- Saving --------------------------------------------------------------------

-- Saves an expense with its items, assignments and shares in one transaction.
--
-- p_shares: [{ "participant_id": uuid, "amount_cents": int, "category_override_id": uuid? }]
--   Must sum exactly to p_total_cents.
-- p_items:  [{ "name": text, "amount_cents": int, "kind": "item|tax|tip|discount",
--              "participant_ids": [uuid] }]   participant_ids only for kind "item".
--   Optional (quick mode has none). When present, must sum exactly to p_total_cents.
-- p_category_id: the payer's category. Only allowed when the caller is the payer;
--   otherwise put the caller's category on their own share as category_override_id.
-- p_replaces_expense_id: voids that expense and links this one as its correction.
--
-- Returns the new expense id.
create function public.save_expense(
  p_group_id uuid,
  p_paid_by uuid,
  p_merchant text,
  p_expense_date date,
  p_total_cents bigint,
  p_shares jsonb,
  p_items jsonb default '[]',
  p_category_id uuid default null,
  p_source text default 'manual',
  p_replaces_expense_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  payer_user_id uuid;
  share_sum bigint;
  item_sum bigint;
  replaced public.expenses;
  new_expense_id uuid;
  item record;
  new_item_id uuid;
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if not private.is_group_member(p_group_id) then
    raise exception 'You are not in this group' using errcode = 'insufficient_privilege';
  end if;

  select user_id into payer_user_id
    from public.participants where id = p_paid_by and group_id = p_group_id;
  if not found then
    raise exception 'The payer is not in this group' using errcode = 'invalid_parameter_value';
  end if;

  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'The total must be more than zero' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_shares) is distinct from 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'An expense needs at least one share' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a list' using errcode = 'invalid_parameter_value';
  end if;

  -- Shares ---------------------------------------------------------------
  if exists (
    select 1
    from jsonb_to_recordset(p_shares) as s(participant_id uuid, amount_cents bigint)
    left join public.participants p on p.id = s.participant_id and p.group_id = p_group_id
    where p.id is null or s.amount_cents is null or s.amount_cents < 0
  ) then
    raise exception 'Every share needs someone in this group and an amount of zero or more'
      using errcode = 'invalid_parameter_value';
  end if;

  if (select count(*) <> count(distinct participant_id)
      from jsonb_to_recordset(p_shares) as s(participant_id uuid)) then
    raise exception 'Each person can have only one share' using errcode = 'invalid_parameter_value';
  end if;

  select sum(amount_cents) into share_sum
    from jsonb_to_recordset(p_shares) as s(amount_cents bigint);
  if share_sum <> p_total_cents then
    raise exception 'Shares sum to % but the total is %', share_sum, p_total_cents
      using errcode = 'check_violation';
  end if;

  -- Categories: only your own, and only on your own share.
  if p_category_id is not null and (
    payer_user_id is distinct from caller
    or not exists (select 1 from public.categories where id = p_category_id and user_id = caller)
  ) then
    raise exception 'The expense category must be yours, and you must be the payer'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_shares) as s(participant_id uuid, category_override_id uuid)
    where s.category_override_id is not null
      and (
        not private.is_my_participant(s.participant_id)
        or not exists (
          select 1 from public.categories c where c.id = s.category_override_id and c.user_id = caller
        )
      )
  ) then
    raise exception 'You can only set a category on your own share, using your own categories'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Items ----------------------------------------------------------------
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(kind text, participant_ids uuid[])
    where (i.kind = 'item' and coalesce(cardinality(i.participant_ids), 0) = 0)
       or (i.kind <> 'item' and coalesce(cardinality(i.participant_ids), 0) > 0)
  ) then
    raise exception 'Items need at least one person; tax, tip and discount lines take none'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(participant_ids uuid[])
    where cardinality(i.participant_ids) <> (select count(distinct x) from unnest(i.participant_ids) as x)
  ) then
    raise exception 'An item lists the same person twice' using errcode = 'invalid_parameter_value';
  end if;

  -- Everyone an item is for must be in the group and have a share.
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(participant_ids uuid[]),
      unnest(coalesce(i.participant_ids, '{}')) as assigned(participant_id)
    where not exists (
      select 1 from jsonb_to_recordset(p_shares) as s(participant_id uuid)
      where s.participant_id = assigned.participant_id
    )
  ) then
    raise exception 'Everyone an item is for needs a share' using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_array_length(p_items) > 0 then
    select sum(amount_cents) into item_sum
      from jsonb_to_recordset(p_items) as i(amount_cents bigint);
    if item_sum is distinct from p_total_cents then
      raise exception 'Items sum to % but the total is %', item_sum, p_total_cents
        using errcode = 'check_violation';
    end if;
  end if;

  -- Correction -----------------------------------------------------------
  if p_replaces_expense_id is not null then
    replaced := private.void_expense_for_caller(p_replaces_expense_id);
    if replaced.group_id <> p_group_id then
      raise exception 'A correction must be in the same group' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- Write ----------------------------------------------------------------
  insert into public.expenses (
    group_id, paid_by, merchant, expense_date, total_cents, category_id, source, created_by,
    replaces_expense_id
  )
  values (
    p_group_id, p_paid_by, btrim(p_merchant), p_expense_date, p_total_cents, p_category_id,
    p_source, caller, p_replaces_expense_id
  )
  returning id into new_expense_id;

  for item in
    select i.name, i.amount_cents, i.kind, i.participant_ids, (i.ord - 1)::integer as position
    from rows from (
      jsonb_to_recordset(p_items) as (name text, amount_cents bigint, kind text, participant_ids uuid[])
    ) with ordinality as i(name, amount_cents, kind, participant_ids, ord)
  loop
    insert into public.expense_items (expense_id, name, amount_cents, kind, position)
      values (new_expense_id, btrim(item.name), item.amount_cents, item.kind, item.position)
      returning id into new_item_id;
    insert into public.item_assignments (item_id, participant_id)
      select new_item_id, unnest(coalesce(item.participant_ids, '{}'));
  end loop;

  insert into public.shares (expense_id, participant_id, amount_cents, category_override_id)
    select new_expense_id, s.participant_id, s.amount_cents, s.category_override_id
    from jsonb_to_recordset(p_shares) as s(participant_id uuid, amount_cents bigint, category_override_id uuid);

  return new_expense_id;
end;
$$;

-- Reading -------------------------------------------------------------------

-- Net who-owes-whom for every pair that includes the caller, per group.
-- Shares of expenses that aren't voided, minus confirmed payments and forgiveness
-- (forgiveness on a voided expense doesn't count). Pairs that come out even are left out.
create function public.balances()
returns table (
  group_id uuid,
  from_participant uuid,
  to_participant uuid,
  amount_cents bigint
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select id from public.participants where user_id = (select auth.uid())
  ),
  directed as (
    select e.group_id, s.participant_id as debtor, e.paid_by as creditor, s.amount_cents as amount
    from public.expenses e
    join public.shares s on s.expense_id = e.id
    where e.voided_at is null and s.participant_id <> e.paid_by
    union all
    select p.group_id, p.from_participant, p.to_participant, -p.amount_cents
    from public.payments p
    left join public.expenses forgiven on forgiven.id = p.expense_id
    where p.status = 'confirmed' and forgiven.voided_at is null
  ),
  pairs as (
    -- Each pair once: positive net means `a` owes `b`.
    select
      group_id,
      least(debtor, creditor) as a,
      greatest(debtor, creditor) as b,
      sum(case when debtor < creditor then amount else -amount end) as net
    from directed
    where debtor in (select id from mine) or creditor in (select id from mine)
    group by 1, 2, 3
  )
  select
    group_id,
    case when net > 0 then a else b end,
    case when net > 0 then b else a end,
    abs(net)::bigint
  from pairs
  where net <> 0
  order by 1, 2, 3;
$$;

-- The caller's spending by month and category: their own shares of expenses that aren't
-- voided, plus debts they forgave (in the forgiven expense's category and month).
-- Repayments never count. A share's category is the caller's override if set; otherwise the
-- payer's own share uses the expense category and anyone else's is uncategorized (null).
create function public.my_spending()
returns table (
  month date,
  category_id uuid,
  amount_cents bigint
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select id from public.participants where user_id = (select auth.uid())
  ),
  spent as (
    select
      date_trunc('month', e.expense_date)::date as month,
      coalesce(
        s.category_override_id,
        case when s.participant_id = e.paid_by then e.category_id end
      ) as category_id,
      s.amount_cents
    from public.expenses e
    join public.shares s on s.expense_id = e.id
    where e.voided_at is null and s.participant_id in (select id from mine)
    union all
    select date_trunc('month', e.expense_date)::date, e.category_id, p.amount_cents
    from public.payments p
    join public.expenses e on e.id = p.expense_id
    where p.kind = 'forgiveness'
      and p.status = 'confirmed'
      and e.voided_at is null
      and p.to_participant in (select id from mine)
  )
  select month, category_id, sum(amount_cents)::bigint
  from spent
  group by month, category_id
  having sum(amount_cents) <> 0
  order by month, category_id nulls first;
$$;

-- What the caller sees of expenses someone else paid: only their own share and the items
-- assigned to them. Never the total or anyone else's items.
-- items: [{ "name", "amount_cents" (the item's full price), "split_count" (people sharing it) }]
create function public.get_my_shares()
returns table (
  expense_id uuid,
  group_id uuid,
  merchant text,
  expense_date date,
  paid_by uuid,
  payer_name text,
  participant_id uuid,
  amount_cents bigint,
  category_override_id uuid,
  items jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    e.id,
    e.group_id,
    e.merchant,
    e.expense_date,
    e.paid_by,
    payer.display_name,
    s.participant_id,
    s.amount_cents,
    s.category_override_id,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', i.name,
            'amount_cents', i.amount_cents,
            'split_count', (select count(*) from public.item_assignments a2 where a2.item_id = i.id)
          )
          order by i.position
        )
        from public.expense_items i
        join public.item_assignments a on a.item_id = i.id
        where i.expense_id = e.id and a.participant_id = s.participant_id
      ),
      '[]'::jsonb
    )
  from public.shares s
  join public.participants me on me.id = s.participant_id
  join public.expenses e on e.id = s.expense_id
  join public.participants payer on payer.id = e.paid_by
  where me.user_id = (select auth.uid())
    and s.participant_id <> e.paid_by
    and e.voided_at is null
  order by e.expense_date desc, e.created_at desc;
$$;

-- Execute rights: signed-in users only. Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function
  public.save_expense(uuid, uuid, text, date, bigint, jsonb, jsonb, uuid, text, uuid),
  public.void_expense(uuid),
  public.balances(),
  public.my_spending(),
  public.get_my_shares()
  from public, anon;
grant execute on function
  public.save_expense(uuid, uuid, text, date, bigint, jsonb, jsonb, uuid, text, uuid),
  public.void_expense(uuid),
  public.balances(),
  public.my_spending(),
  public.get_my_shares()
  to authenticated, service_role;

revoke execute on all functions in schema private from public, anon;
