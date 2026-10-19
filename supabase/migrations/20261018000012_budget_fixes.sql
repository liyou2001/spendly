-- Fixes from reviewing Step 7:
-- 1. How you filed your share follows an expense when it's edited (replaced).
-- 2. A category with shares filed under it can't be deleted, like one expenses use.
-- 3. One definition of "your category for a share", used everywhere, and one spending query
--    that my_spending_items() and my_spending() are both built on.
-- 4. my_spending_items() gives each row its own id (two forgiven debts on one expense).

-- 1. Copy filings to the new version when an expense is edited.
create function private.copy_share_filings()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.replaces_expense_id is not null then
    insert into public.share_categories (user_id, expense_id, category_id)
      select user_id, new.id, category_id
      from public.share_categories
      where expense_id = new.replaces_expense_id
      on conflict (user_id, expense_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger expenses_copy_share_filings
  after insert on public.expenses
  for each row execute function private.copy_share_filings();

-- 2. Block deleting a category that shares are filed under (was: silently unfile them).
alter table public.share_categories
  drop constraint share_categories_category_id_user_id_fkey,
  add constraint share_categories_category_id_user_id_fkey
    foreign key (category_id, user_id) references public.categories (id, user_id);

-- 3. Your category for your share of an expense: how you filed it, else the category set when
--    it was saved, else the expense's own category if you paid.
create function private.my_category(
  p_expense_id uuid,
  p_participant_id uuid,
  p_paid_by uuid,
  p_expense_category_id uuid,
  p_category_override_id uuid
)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select category_id from public.share_categories
     where user_id = (select auth.uid()) and expense_id = p_expense_id),
    p_category_override_id,
    case when p_participant_id = p_paid_by then p_expense_category_id end
  );
$$;

-- Everything that counts as your spending, in every month: your share of each expense (not
-- voided), and debts you forgave. The total is only given for expenses you paid or entered.
create function private.my_spending_rows()
returns table (
  item_id uuid,
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
  )
  select e.id, e.id, e.group_id, e.merchant, e.expense_date,
         private.my_category(e.id, s.participant_id, e.paid_by, e.category_id, s.category_override_id),
         s.amount_cents,
         case when s.participant_id = e.paid_by or e.created_by = (select auth.uid())
              then e.total_cents end,
         payer.display_name,
         s.participant_id = e.paid_by,
         false
  from public.expenses e
  join public.shares s on s.expense_id = e.id
  join public.participants payer on payer.id = e.paid_by
  where e.voided_at is null and s.participant_id in (select id from mine) and s.amount_cents > 0
  union all
  select p.id, e.id, e.group_id, e.merchant, e.expense_date, e.category_id, p.amount_cents,
         e.total_cents, payer.display_name, true, true
  from public.payments p
  join public.expenses e on e.id = p.expense_id
  join public.participants payer on payer.id = e.paid_by
  where p.kind = 'forgiveness' and p.status = 'confirmed' and e.voided_at is null
    and p.to_participant in (select id from mine);
$$;

drop function public.my_spending_items(date);

-- Your spending items for one month, newest first.
create function public.my_spending_items(p_month date)
returns table (
  item_id uuid,
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
  select *
  from private.my_spending_rows() r
  where r.expense_date >= date_trunc('month', p_month)::date
    and r.expense_date < (date_trunc('month', p_month) + interval '1 month')::date
  order by r.expense_date desc, r.merchant, r.is_forgiveness;
$$;

-- Your spending by month and category: the same rows, added up.
create or replace function public.my_spending()
returns table (
  month date,
  category_id uuid,
  amount_cents bigint
)
language sql stable security definer set search_path = ''
as $$
  select date_trunc('month', r.expense_date)::date, r.category_id, sum(r.amount_cents)::bigint
  from private.my_spending_rows() r
  group by 1, 2
  having sum(r.amount_cents) <> 0
  order by 1, 2 nulls first;
$$;

-- get_my_shares() returns your category for each share (filed or set when saving), so the
-- app doesn't merge it in separately.
drop function public.get_my_shares();

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

revoke execute on function public.my_spending_items(date), public.get_my_shares() from public, anon;
grant execute on function public.my_spending_items(date), public.get_my_shares() to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
