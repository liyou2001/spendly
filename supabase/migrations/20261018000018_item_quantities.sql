-- Quantities on line items, split by units: "3 × Soft drink" for $7.50, Jeff 2 and Maya 1,
-- is Jeff $5.00 and Maya $2.50. The app works out the shares (packages/ledger); the database
-- stores the quantity and each person's units and shows them back.

-- How many of the item the line is for. The amount is still the line's total.
alter table public.expense_items
  add column quantity integer not null default 1 check (quantity between 1 and 999),
  add constraint expense_items_quantity_only_on_items check (kind = 'item' or quantity = 1);

-- How many of those units are this person's. 1 each is an even split.
alter table public.item_assignments
  add column units integer not null default 1 check (units >= 1);

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
    insert into public.expense_items (expense_id, name, amount_cents, kind, position, quantity)
      values (
        new_expense_id, btrim(item.name), item.amount_cents, item.kind, item.position,
        coalesce(item.quantity, 1)
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

-- Your items now say how many there were and how many were yours ("your 1 of 3"). Not who had
-- the others, as before.
create or replace function public.get_my_shares()
returns table (
  expense_id uuid,
  group_id uuid,
  merchant text,
  expense_date date,
  paid_by uuid,
  payer_name text,
  participant_id uuid,
  amount_cents bigint,
  category_id uuid,
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
    private.my_category(e.id, s.participant_id, e.paid_by, e.category_id, s.category_override_id),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', i.name,
            'amount_cents', i.amount_cents,
            'quantity', i.quantity,
            'split_count', (select count(*) from public.item_assignments a2 where a2.item_id = i.id),
            'my_units', a.units,
            'total_units', (select sum(a2.units) from public.item_assignments a2 where a2.item_id = i.id)
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

-- The payment page shows the same.
create or replace function public.link_share(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  link public.share_links := private.active_link(p_token_hash);
  them public.participants;
  payer public.participants;
  handles public.profiles;
  owed bigint;
  shown jsonb;
  earlier integer;
begin
  select * into them from public.participants where id = link.participant_id;
  select * into payer from public.participants where id = link.requested_by;
  select * into handles from public.profiles where id = payer.user_id;
  owed := private.pair_owed(them.group_id, them.id, payer.id);

  -- Newest first, until they cover what's owed. Older ones were paid off already.
  with mine as (
    select
      e.merchant,
      e.expense_date,
      e.created_at,
      s.amount_cents,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', i.name,
            'amount_cents', i.amount_cents,
            'quantity', i.quantity,
            'split_count', (select count(*) from public.item_assignments a2 where a2.item_id = i.id),
            'my_units', a.units,
            'total_units', (select sum(a2.units) from public.item_assignments a2 where a2.item_id = i.id)
          )
          order by i.position
        )
        from public.expense_items i
        join public.item_assignments a on a.item_id = i.id
        where i.expense_id = e.id and a.participant_id = them.id
      ), '[]'::jsonb) as items,
      coalesce(sum(s.amount_cents) over (
        order by e.expense_date desc, e.created_at desc, e.id
        rows between unbounded preceding and 1 preceding
      ), 0) as before
    from public.expenses e
    join public.shares s on s.expense_id = e.id and s.participant_id = them.id
    where e.paid_by = payer.id and e.voided_at is null and s.amount_cents > 0
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'merchant', merchant,
          'expense_date', expense_date,
          'amount_cents', amount_cents,
          'items', items
        )
        order by expense_date desc, created_at desc
      ) filter (where before < owed),
      '[]'::jsonb
    ),
    count(*) filter (where before >= owed)
  into shown, earlier
  from mine;

  return jsonb_build_object(
    'person_name', them.display_name,
    'payer_name', payer.display_name,
    'group_name', (select name from public.groups where id = them.group_id),
    'owed_cents', owed,
    'pending_cents', (
      select coalesce(sum(amount_cents), 0) from public.payments
      where from_participant = them.id and to_participant = payer.id and status = 'claimed'
    ),
    'handles', jsonb_build_object(
      'venmo', handles.venmo_username,
      'paypal', handles.paypal_username,
      'cashtag', handles.cashapp_tag,
      'zelle', handles.zelle_contact
    ),
    'texts_opted_in', exists (
      select 1 from public.sms_consents where participant_id = them.id and revoked_at is null
    ),
    'expenses', shown,
    'earlier_count', earlier
  );
end;
$$;
