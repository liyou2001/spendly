-- Step 7: budgets, and categorizing your share of someone else's expense.

-- Budgets carry forward: a row for a month applies to that month and later ones until the next
-- row. A row with no amount means "no budget from this month on".
alter table public.budgets alter column amount_cents drop not null;

-- Sets (or with p_amount_cents null, removes) your budget for a category from a month on.
create function public.set_budget(p_category_id uuid, p_month date, p_amount_cents bigint default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.categories where id = p_category_id and user_id = auth.uid()) then
    raise exception 'Category not found' using errcode = 'no_data_found';
  end if;
  if p_amount_cents is not null and p_amount_cents < 0 then
    raise exception 'A budget can’t be negative' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.budgets (user_id, category_id, month, amount_cents)
    values (auth.uid(), p_category_id, date_trunc('month', p_month)::date, p_amount_cents)
    on conflict (user_id, category_id, month) do update set amount_cents = excluded.amount_cents;
end;
$$;

-- How you file your share of an expense someone else paid. Separate from shares (which are
-- append-only ledger rows): it only says which of your categories it counts under for you.
create table public.share_categories (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  expense_id uuid not null references public.expenses,
  category_id uuid not null,
  primary key (user_id, expense_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

alter table public.share_categories enable row level security;
grant select on public.share_categories to authenticated;
create policy "Own share categories" on public.share_categories
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Files your share of someone else's expense under one of your categories (null clears it).
-- The payer's own category is the expense's, changed by editing the expense.
create function public.set_share_category(p_expense_id uuid, p_category_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.shares s
    join public.participants p on p.id = s.participant_id
    join public.expenses e on e.id = s.expense_id
    where s.expense_id = p_expense_id and p.user_id = auth.uid() and e.paid_by <> s.participant_id
  ) then
    raise exception 'You don’t have a share in someone else’s expense here' using errcode = 'no_data_found';
  end if;

  if p_category_id is null then
    delete from public.share_categories where user_id = auth.uid() and expense_id = p_expense_id;
    return;
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and user_id = auth.uid()) then
    raise exception 'Category not found' using errcode = 'no_data_found';
  end if;
  insert into public.share_categories (user_id, expense_id, category_id)
    values (auth.uid(), p_expense_id, p_category_id)
    on conflict (user_id, expense_id) do update set category_id = excluded.category_id;
end;
$$;

-- Your spending items for a month: your share of each expense (not voided), plus debts you
-- forgave. The basis for the Budget screen and activity list; summed by category it equals
-- my_spending(). The total is only given for expenses you paid or entered (privacy).
create function public.my_spending_items(p_month date)
returns table (
  expense_id uuid,
  group_id uuid,
  merchant text,
  expense_date date,
  category_id uuid,
  amount_cents bigint,
  total_cents bigint,
  paid_by_name text,
  you_paid boolean,
  is_forgiveness boolean
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select id from public.participants where user_id = (select auth.uid())
  ),
  month_bounds as (
    select date_trunc('month', p_month)::date as first,
           (date_trunc('month', p_month) + interval '1 month')::date as next
  )
  select e.id, e.group_id, e.merchant, e.expense_date,
         coalesce(
           sc.category_id,
           s.category_override_id,
           case when s.participant_id = e.paid_by then e.category_id end
         ),
         s.amount_cents,
         case when s.participant_id = e.paid_by or e.created_by = (select auth.uid())
              then e.total_cents end,
         payer.display_name,
         s.participant_id = e.paid_by,
         false
  from public.expenses e
  join public.shares s on s.expense_id = e.id
  join public.participants payer on payer.id = e.paid_by
  left join public.share_categories sc
    on sc.expense_id = e.id and sc.user_id = (select auth.uid())
  cross join month_bounds m
  where e.voided_at is null
    and s.participant_id in (select id from mine)
    and s.amount_cents > 0
    and e.expense_date >= m.first and e.expense_date < m.next
  union all
  select e.id, e.group_id, e.merchant, e.expense_date, e.category_id, p.amount_cents,
         e.total_cents, payer.display_name, true, true
  from public.payments p
  join public.expenses e on e.id = p.expense_id
  join public.participants payer on payer.id = e.paid_by
  cross join month_bounds m
  where p.kind = 'forgiveness' and p.status = 'confirmed' and e.voided_at is null
    and p.to_participant in (select id from mine)
    and e.expense_date >= m.first and e.expense_date < m.next
  order by 4 desc, 3;
$$;

-- my_spending() now also follows how you filed your share of someone else's expense.
create or replace function public.my_spending()
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
        sc.category_id,
        s.category_override_id,
        case when s.participant_id = e.paid_by then e.category_id end
      ) as category_id,
      s.amount_cents
    from public.expenses e
    join public.shares s on s.expense_id = e.id
    left join public.share_categories sc
      on sc.expense_id = e.id and sc.user_id = (select auth.uid())
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

revoke execute on function
  public.set_budget(uuid, date, bigint),
  public.set_share_category(uuid, uuid),
  public.my_spending_items(date)
  from public, anon;
grant execute on function
  public.set_budget(uuid, date, bigint),
  public.set_share_category(uuid, uuid),
  public.my_spending_items(date)
  to authenticated;
