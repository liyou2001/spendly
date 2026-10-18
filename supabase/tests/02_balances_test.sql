-- balances() and my_spending(): the database versions of computeBalances/netBalances and
-- spendingByCategory in packages/ledger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Test helpers: act as a signed-in user, or go back to the table owner.
create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
-- Balances with names instead of ids, in a stable order.
create function tests.my_balances() returns table (group_name text, from_name text, to_name text, amount_cents bigint)
language sql as $$
  select g.name, f.display_name, t.display_name, b.amount_cents
  from public.balances() b
  join public.groups g on g.id = b.group_id
  join public.participants f on f.id = b.from_participant
  join public.participants t on t.id = b.to_participant
  order by 1, 2, 3;
$$;
create function tests.my_spending() returns table (month date, category text, amount_cents bigint)
language sql as $$
  select s.month, c.name, s.amount_cents
  from public.my_spending() s
  left join public.categories c on c.id = s.category_id
  order by 1, 2 nulls first;
$$;
grant execute on all functions in schema tests to public;

-- Seed: Leo paid $140 at Costco ---------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');

select results_eq(
  'select * from tests.my_balances()',
  $$values ('Apartment', 'Jeff', 'Leo', 1500::bigint), ('Apartment', 'Maya', 'Leo', 4200::bigint)$$,
  'Seed: Jeff owes Leo 1500 and Maya owes Leo 4200'
);
select results_eq(
  'select * from tests.my_spending()',
  $$values ('2026-10-01'::date, 'Groceries', 8300::bigint)$$,
  'Seed: Leo''s spending is his 8300 share, under Groceries'
);

-- A dinner group where Jeff owes Leo 4250 ------------------------------------
select tests.as_owner();
insert into public.groups (id, name, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Dinner', '11111111-1111-1111-1111-111111111111');
insert into public.participants (id, group_id, display_name, user_id)
values ('bbbbbbbb-0000-0000-0000-000000000011', 'bbbbbbbb-0000-0000-0000-000000000001', 'Leo',
        '11111111-1111-1111-1111-111111111111'),
       ('bbbbbbbb-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000001', 'Jeff', null);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.save_expense(
  p_group_id => 'bbbbbbbb-0000-0000-0000-000000000001',
  p_paid_by => 'bbbbbbbb-0000-0000-0000-000000000011',
  p_merchant => 'Thai place',
  p_expense_date => '2026-10-20',
  p_total_cents => 8500,
  p_shares => '[{"participant_id": "bbbbbbbb-0000-0000-0000-000000000011", "amount_cents": 4250},
                {"participant_id": "bbbbbbbb-0000-0000-0000-000000000012", "amount_cents": 4250}]',
  p_category_id => (select id from public.categories
                    where user_id = '11111111-1111-1111-1111-111111111111' and name = 'Dining')
);

select results_eq(
  $$select * from tests.my_balances() where group_name = 'Dinner'$$,
  $$values ('Dinner', 'Jeff', 'Leo', 4250::bigint)$$,
  'Jeff owes Leo 4250 for dinner'
);

-- Payments --------------------------------------------------------------------
select tests.as_owner();
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status,
                             method, recorded_by, decided_by, decided_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000012',
        'bbbbbbbb-0000-0000-0000-000000000011', 2000, 'payment', 'confirmed', 'venmo',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());
select tests.as_user('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$select * from tests.my_balances() where group_name = 'Dinner'$$,
  $$values ('Dinner', 'Jeff', 'Leo', 2250::bigint)$$,
  'A confirmed 2000 payment leaves Jeff owing 2250'
);

select tests.as_owner();
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000012',
        'bbbbbbbb-0000-0000-0000-000000000011', 1000, 'payment', 'claimed');
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status,
                             decided_by, decided_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000012',
        'bbbbbbbb-0000-0000-0000-000000000011', 1000, 'payment', 'rejected',
        '11111111-1111-1111-1111-111111111111', now());
select tests.as_user('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$select * from tests.my_balances() where group_name = 'Dinner'$$,
  $$values ('Dinner', 'Jeff', 'Leo', 2250::bigint)$$,
  'Claimed and rejected payments do not change the balance'
);

select tests.as_owner();
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status,
                             decided_by, decided_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000012',
        'bbbbbbbb-0000-0000-0000-000000000011', 3000, 'payment', 'confirmed',
        '11111111-1111-1111-1111-111111111111', now());
select tests.as_user('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$select * from tests.my_balances() where group_name = 'Dinner'$$,
  $$values ('Dinner', 'Leo', 'Jeff', 750::bigint)$$,
  'Overpaying by 750 flips the debt: Leo owes Jeff 750'
);

-- Netting ---------------------------------------------------------------------
-- Maya paid $30.00 of utilities, all Leo's share.
select tests.as_owner();
insert into public.expenses (id, group_id, paid_by, merchant, expense_date, total_cents, created_by)
values ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333330003', 'Utilities', '2026-11-03', 3000,
        '11111111-1111-1111-1111-111111111111');
insert into public.shares (expense_id, participant_id, amount_cents)
values ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333330001', 3000);
select tests.as_user('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$select * from tests.my_balances() where group_name = 'Apartment'$$,
  $$values ('Apartment', 'Jeff', 'Leo', 1500::bigint), ('Apartment', 'Maya', 'Leo', 1200::bigint)$$,
  'Leo owes Maya 3000 and Maya owes Leo 4200, so Maya owes Leo 1200'
);

-- Spending --------------------------------------------------------------------
select results_eq(
  'select * from tests.my_spending()',
  $$values ('2026-10-01'::date, 'Dining', 4250::bigint),
           ('2026-10-01'::date, 'Groceries', 8300::bigint),
           ('2026-11-01'::date, null, 3000::bigint)$$,
  'Spending is Leo''s own shares by month; a share of someone else''s expense is uncategorized'
);

-- Leo pays Jeff back the 750.
select tests.as_owner();
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status,
                             recorded_by, decided_by, decided_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000011',
        'bbbbbbbb-0000-0000-0000-000000000012', 750, 'payment', 'confirmed',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());
select tests.as_user('11111111-1111-1111-1111-111111111111');

select is_empty(
  $$select * from tests.my_balances() where group_name = 'Dinner'$$,
  'Paying back the 750 settles the dinner group'
);
select results_eq(
  'select * from tests.my_spending()',
  $$values ('2026-10-01'::date, 'Dining', 4250::bigint),
           ('2026-10-01'::date, 'Groceries', 8300::bigint),
           ('2026-11-01'::date, null, 3000::bigint)$$,
  'Repayments, in either direction, do not change spending'
);

-- Forgiveness -----------------------------------------------------------------
-- Leo forgives Jeff's 1500 for Costco.
select tests.as_owner();
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind,
                             expense_id, status, recorded_by, decided_by, decided_at)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330002',
        '33333333-3333-3333-3333-333333330001', 1500, 'forgiveness',
        '44444444-4444-4444-4444-444444444444', 'confirmed',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());
select tests.as_user('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$select * from tests.my_balances() where group_name = 'Apartment'$$,
  $$values ('Apartment', 'Maya', 'Leo', 1200::bigint)$$,
  'Forgiving Jeff''s 1500 clears his balance'
);
select results_eq(
  $$select * from tests.my_spending() where category = 'Groceries'$$,
  $$values ('2026-10-01'::date, 'Groceries', 9800::bigint)$$,
  'The forgiven 1500 becomes Leo''s spending in the Costco expense''s category and month'
);

-- Voiding ---------------------------------------------------------------------
select public.void_expense('44444444-4444-4444-4444-444444444444');

select results_eq(
  'select * from tests.my_balances()',
  $$values ('Apartment', 'Leo', 'Maya', 3000::bigint)$$,
  'Voiding Costco removes it, and its forgiveness, from balances'
);
select results_eq(
  'select * from tests.my_spending()',
  $$values ('2026-10-01'::date, 'Dining', 4250::bigint), ('2026-11-01'::date, null, 3000::bigint)$$,
  'Voiding Costco removes it, and its forgiveness, from spending'
);

select * from finish();
rollback;
