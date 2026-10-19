-- Fixes from reviewing Step 9 and quantities:
-- 1. Items say whether they were tagged one by one (by_units), so an even split of
--    "2 × Pizza" reopens as Split evenly rather than as tags with the same units.
-- 2. Unreadable photos get their own status, so the monthly scan count doesn't depend on the
--    wording of an error message.
-- 3. People can delete their own receipt photos (the app cleans up an upload that was never
--    read; extract-receipt deletes photos once read).

-- 1. Tagged one by one, or split evenly. Items saved before this were all even or one person.
alter table public.expense_items add column by_units boolean not null default false;

create or replace function public.save_expense(
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

  -- Quantities and units: "3 × Soft drink" split Jeff 2, Maya 1. Units are optional (an even
  -- split); when given there's one per person, each at least 1, adding up to the quantity.
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(kind text, quantity integer)
    where coalesce(i.quantity, 1) not between 1 and 999
       or (i.kind <> 'item' and coalesce(i.quantity, 1) <> 1)
  ) then
    raise exception 'Quantities are whole numbers from 1 to 999, and only on items'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(kind text, quantity integer, participant_ids uuid[], units integer[])
    where i.units is not null and (
      i.kind <> 'item'
      or cardinality(i.units) <> coalesce(cardinality(i.participant_ids), 0)
      or exists (select 1 from unnest(i.units) as u where u is null or u < 1)
      or (select sum(u) from unnest(i.units) as u) <> coalesce(i.quantity, 1)
    )
  ) then
    raise exception 'Each person on an item needs a count, and the counts must add up to the quantity'
      using errcode = 'invalid_parameter_value';
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
    select i.name, i.amount_cents, i.kind, i.participant_ids, i.quantity, i.units,
           (i.ord - 1)::integer as position
    from rows from (
      jsonb_to_recordset(p_items) as (
        name text, amount_cents bigint, kind text, participant_ids uuid[], quantity integer,
        units integer[]
      )
    ) with ordinality as i(name, amount_cents, kind, participant_ids, quantity, units, ord)
  loop
    insert into public.expense_items (
      expense_id, name, amount_cents, kind, position, quantity, by_units
    )
      values (
        new_expense_id, btrim(item.name), item.amount_cents, item.kind, item.position,
        coalesce(item.quantity, 1), item.units is not null
      )
      returning id into new_item_id;
    insert into public.item_assignments (item_id, participant_id, units)
      select new_item_id, people.participant_id, coalesce(people.units, 1)
      from unnest(coalesce(item.participant_ids, '{}'), item.units) as people(participant_id, units);
  end loop;

  insert into public.shares (expense_id, participant_id, amount_cents, category_override_id)
    select new_expense_id, s.participant_id, s.amount_cents, s.category_override_id
    from jsonb_to_recordset(p_shares) as s(participant_id uuid, amount_cents bigint, category_override_id uuid);

  return new_expense_id;
end;
$$;

-- 2. Unreadable is its own status.
alter table public.receipt_extractions drop constraint receipt_extractions_status_check;
alter table public.receipt_extractions add constraint receipt_extractions_status_check
  check (status in ('pending', 'succeeded', 'mismatch', 'unreadable', 'failed'));

update public.receipt_extractions set status = 'unreadable'
where status = 'failed' and error like 'Unreadable:%';

create or replace function public.receipt_scans_this_month(p_user_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(distinct storage_path)::integer
  from public.receipt_extractions
  where user_id = p_user_id and source = 'photo'
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    and status in ('succeeded', 'mismatch', 'unreadable');
$$;

-- 3. Delete your own receipt photos.
create policy "Delete your own receipts" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
