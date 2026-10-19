-- Fixes from reviewing transparent groups:
-- 1. Categories stay private: members read expenses and shares in full except the payer's
--    category and each person's own category on their share. Each person gets their own
--    category for an expense from my_category_for().
-- 2. Balances are transparent too: everyone in a group sees who owes whom across the group.

revoke select on public.expenses from authenticated;
grant select (
  id, group_id, paid_by, merchant, expense_date, total_cents, source, created_by, created_at,
  voided_at, voided_by, replaces_expense_id
) on public.expenses to authenticated;

revoke select on public.shares from authenticated;
grant select (expense_id, participant_id, amount_cents) on public.shares to authenticated;

-- Your category for an expense: how you filed your share, else the category set when it was
-- saved, else the expense's own if you paid. null if you're not in its group.
create function public.my_category_for(p_expense_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select private.my_category(e.id, me.id, e.paid_by, e.category_id, s.category_override_id)
  from public.expenses e
  join public.participants me on me.group_id = e.group_id and me.user_id = (select auth.uid())
  left join public.shares s on s.expense_id = e.id and s.participant_id = me.id
  where e.id = p_expense_id;
$$;

revoke execute on function public.my_category_for(uuid) from public, anon;
grant execute on function public.my_category_for(uuid) to authenticated;

-- Every pair in your groups, not only pairs that include you.
create or replace function public.balances()
returns table (
  group_id uuid,
  from_participant uuid,
  to_participant uuid,
  amount_cents bigint
)
language sql stable security definer set search_path = ''
as $$
  with directed as (
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
    where private.is_group_member(group_id)
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
