-- Rule 5: each person sees only their own share. Nothing is readable signed out.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
-- Looks up ids the current test user isn't allowed to see.
create function tests.personal_group_of(p_user uuid) returns uuid
language sql security definer as $$
  select id from public.groups where created_by = p_user and is_personal;
$$;
grant execute on all functions in schema tests to public;

-- Setup -----------------------------------------------------------------------
-- Sam: an unrelated user. Jeff: signs up and is linked to the Jeff participant in the apartment.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff@example.com', '{"display_name": "Jeff"}');
update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = '33333333-3333-3333-3333-333333330002';

-- A personal purchase of Leo's, in his Personal group.
insert into public.expenses (id, group_id, paid_by, merchant, expense_date, total_cents, created_by)
select 'dddddddd-0000-0000-0000-000000000001', g.id, p.id, 'Bookstore', '2026-10-05', 3500,
       '11111111-1111-1111-1111-111111111111'
from public.groups g join public.participants p on p.group_id = g.id
where g.created_by = '11111111-1111-1111-1111-111111111111' and g.is_personal;
insert into public.expense_items (id, expense_id, name, amount_cents, kind, position)
values ('dddddddd-0000-0000-0000-000000000011', 'dddddddd-0000-0000-0000-000000000001',
        'Textbook', 3500, 'item', 0);
insert into public.shares (expense_id, participant_id, amount_cents)
select 'dddddddd-0000-0000-0000-000000000001', p.id, 3500
from public.participants p join public.groups g on g.id = p.group_id
where g.created_by = '11111111-1111-1111-1111-111111111111' and g.is_personal;

-- Signed out --------------------------------------------------------------------
select tests.as_anon();

select throws_ok('select * from public.expenses', '42501', null, 'Signed out: cannot read expenses');
select throws_ok('select * from public.expense_items', '42501', null, 'Signed out: cannot read items');
select throws_ok('select * from public.shares', '42501', null, 'Signed out: cannot read shares');
select throws_ok('select * from public.payments', '42501', null, 'Signed out: cannot read payments');
select throws_ok('select * from public.participants', '42501', null, 'Signed out: cannot read participants');
select throws_ok('select * from public.profiles', '42501', null, 'Signed out: cannot read profiles');
select throws_ok('select * from public.balances()', '42501', null, 'Signed out: cannot call balances()');
select throws_ok('select * from public.get_my_shares()', '42501', null, 'Signed out: cannot call get_my_shares()');
select throws_ok('select * from public.my_spending()', '42501', null, 'Signed out: cannot call my_spending()');

-- A second, unrelated user --------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');

select is_empty('select id, total_cents from public.expenses', 'Sam cannot read any of Leo''s expenses, or the $140 total');
select is_empty('select * from public.expense_items', 'Sam cannot read Leo''s items, personal or shared');
select is_empty('select * from public.item_assignments', 'Sam cannot read item assignments');
select is_empty('select expense_id, amount_cents from public.shares', 'Sam cannot read shares');
select is_empty('select * from public.balances()', 'Sam has no balances');
select is_empty('select * from public.get_my_shares()', 'Sam has no shares');
select results_eq(
  'select name from public.groups',
  $$values ('Personal')$$,
  'Sam sees only his own Personal group'
);
select is_empty(
  $$select * from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$,
  'Sam cannot read Leo''s profile'
);
select is_empty(
  $$select * from public.categories where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'Sam cannot read Leo''s categories'
);

-- Jeff, now with an account, in the apartment group ---------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');

-- Groups are transparent (Rule 5): Jeff sees the whole Costco bill, though Leo paid.
select results_eq(
  $$select merchant, total_cents from public.expenses$$,
  $$values ('Costco', 14000::bigint)$$,
  'Jeff, in the group, reads the Costco expense and its $140 total'
);
select is(
  (select count(*)::int from public.expense_items), 9, 'and all 9 items, Leo’s and Maya’s too'
);
select results_eq(
  $$select p.display_name, s.amount_cents from public.shares s
    join public.participants p on p.id = s.participant_id order by p.display_name$$,
  $$values ('Jeff', 1500::bigint), ('Leo', 8300::bigint), ('Maya', 4200::bigint)$$,
  'and everyone’s shares'
);

select results_eq(
  $$select merchant, payer_name, amount_cents from public.get_my_shares()$$,
  $$values ('Costco', 'Leo', 1500::bigint)$$,
  'get_my_shares gives Jeff his 1500 share of Costco, paid by Leo'
);
select results_eq(
  $$select item ->> 'name', (item ->> 'amount_cents')::bigint, (item ->> 'split_count')::int
    from public.get_my_shares(), jsonb_array_elements(items) as item$$,
  $$values ('Paper towels', 2299::bigint, 3), ('Dish soap', 1149::bigint, 3), ('Trash bags', 1052::bigint, 3)$$,
  'get_my_shares lists only Jeff''s 3 shared items'
);
select ok(
  (select bool_and(
     to_jsonb(s)::text not like '%14000%'
     and to_jsonb(s)::text not like '%Protein powder%'
     and to_jsonb(s)::text not like '%Oat milk%'
     and to_jsonb(s)::text not like '%4200%'
     and to_jsonb(s)::text not like '%8300%')
   from public.get_my_shares() s),
  'get_my_shares never includes the total, Leo''s or Maya''s items, or their amounts'
);
select results_eq(
  $$select f.display_name, t.display_name, b.amount_cents from public.balances() b
    join public.participants f on f.id = b.from_participant
    join public.participants t on t.id = b.to_participant$$,
  $$values ('Jeff', 'Leo', 1500::bigint), ('Maya', 'Leo', 4200::bigint)$$,
  'Jeff sees the whole group’s balances, including what Maya owes Leo'
);
-- Categories stay private: only your own, through my_category_for().
select throws_ok(
  'select category_id from public.expenses', '42501', null,
  'Jeff can’t read the payer’s category on an expense'
);
select throws_ok(
  'select category_override_id from public.shares', '42501', null,
  'or anyone’s category on their share'
);
select is(
  public.my_category_for('44444444-4444-4444-4444-444444444444'), null::uuid,
  'His own category for Costco is unset until he files it'
);
select is_empty('select * from public.my_spending() where amount_cents = 14000', 'Jeff''s spending never shows the total');
select results_eq(
  'select amount_cents from public.my_spending()',
  $$values (1500::bigint)$$,
  'Jeff''s spending is his 1500 share'
);

-- Jeff can't take over someone else's identity or break into other groups.
select throws_ok(
  $$update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
    where id = '33333333-3333-3333-3333-333333330003'$$,
  '42501', null,
  'Jeff cannot link himself to Maya''s participant to see her shares'
);
select throws_ok(
  $$insert into public.participants (group_id, display_name, user_id)
    values ('22222222-2222-2222-2222-222222222222', 'Sam', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null,
  'Jeff cannot add another account to a group'
);
select throws_ok(
  $$insert into public.participants (group_id, display_name)
    values (tests.personal_group_of('11111111-1111-1111-1111-111111111111'), 'Intruder')$$,
  '42501', null,
  'Nobody can add people to someone else''s Personal group'
);
select throws_ok(
  $$insert into public.participants (group_id, display_name)
    values (tests.personal_group_of('aaaaaaaa-0000-0000-0000-000000000002'), 'Roommate')$$,
  '42501', null,
  'Nobody can add people to their own Personal group either'
);
select throws_ok(
  $$select public.void_expense('44444444-4444-4444-4444-444444444444')$$,
  'P0002', null,
  'Jeff cannot void an expense Leo paid for'
);

select * from finish();
rollback;
