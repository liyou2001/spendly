-- Budgets, filing your share of someone else's expense, and my_spending_items.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.category_of(p_user uuid, p_name text) returns uuid language sql security definer as $$
  select id from public.categories where user_id = p_user and name = p_name;
$$;
grant execute on all functions in schema tests to public;

-- Jeff has an account, linked to his participant.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff@example.com', '{"display_name": "Jeff"}');
update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = '33333333-3333-3333-3333-333333330002';

-- Leo's view of October ------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select merchant, amount_cents, total_cents, you_paid, is_forgiveness,
      category_id = tests.category_of(auth.uid(), 'Groceries')
    from public.my_spending_items('2026-10-01')$$,
  $$values ('Costco', 8300::bigint, 14000::bigint, true, false, true)$$,
  'Leo’s October: his $83 share of the $140 Costco trip, under Groceries'
);
select results_eq(
  $$select category_id, sum(amount_cents)::bigint from public.my_spending_items('2026-10-01') group by 1$$,
  $$select category_id, amount_cents from public.my_spending() where month = '2026-10-01'$$,
  'my_spending_items adds up to my_spending()'
);
select is_empty($$select * from public.my_spending_items('2026-11-01')$$, 'Nothing in November');

-- Budgets carry forward and can be removed from a month on.
select lives_ok(
  $$select public.set_budget(tests.category_of(auth.uid(), 'Groceries'), '2026-10-15', 30000)$$,
  'Leo sets a $300 Groceries budget in October (any day of the month works)'
);
select results_eq(
  $$select month, amount_cents from public.budgets$$,
  $$values ('2026-10-01'::date, 30000::bigint)$$,
  'Stored for the first of the month'
);
select public.set_budget(tests.category_of(auth.uid(), 'Groceries'), '2026-10-01', 35000);
select public.set_budget(tests.category_of(auth.uid(), 'Groceries'), '2026-12-01', null);
select results_eq(
  $$select month, amount_cents from public.budgets order by month$$,
  $$values ('2026-10-01'::date, 35000::bigint), ('2026-12-01'::date, null::bigint)$$,
  'Setting it again updates that month; removing it from December leaves an empty row'
);
select throws_ok(
  $$select public.set_budget(tests.category_of(auth.uid(), 'Groceries'), '2026-10-01', -1)$$,
  '22023', null, 'Budgets can’t be negative'
);

-- Jeff files his share of Leo's expense under his own category -------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$select amount_cents, total_cents, category_id from public.my_spending_items('2026-10-01')$$,
  $$values (1500::bigint, null::bigint, null::uuid)$$,
  'Jeff sees his $15 share, uncategorized, and never the $140 total'
);
select lives_ok(
  $$select public.set_share_category('44444444-4444-4444-4444-444444444444', tests.category_of(auth.uid(), 'Rent'))$$,
  'Jeff files his share under his Rent'
);
select results_eq(
  $$select category_id = tests.category_of(auth.uid(), 'Rent') from public.my_spending()$$,
  $$values (true)$$,
  'my_spending() counts it under Jeff’s Rent'
);
select throws_ok(
  $$select public.set_share_category('44444444-4444-4444-4444-444444444444',
      tests.category_of('11111111-1111-1111-1111-111111111111', 'Groceries'))$$,
  'P0002', null, 'He can only use his own categories'
);

select results_eq(
  $$select category_id = tests.category_of(auth.uid(), 'Rent') from public.my_spending_items('2026-10-01')$$,
  $$values (true)$$,
  'my_spending_items(), which the Budget screen uses, shows it under Rent too'
);
select results_eq(
  $$select category_id = tests.category_of(auth.uid(), 'Rent') from public.get_my_shares()$$,
  $$values (true)$$,
  'get_my_shares() returns his filed category'
);
select throws_ok(
  $$delete from public.categories where id = tests.category_of(auth.uid(), 'Rent')$$,
  '23503', null, 'A category with shares filed under it can’t be deleted'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.set_share_category('44444444-4444-4444-4444-444444444444', tests.category_of(auth.uid(), 'Fun'))$$,
  'P0002', null, 'The payer files his share by editing the expense, not this way'
);
select throws_ok(
  $$select public.set_budget(tests.category_of('aaaaaaaa-0000-0000-0000-000000000002', 'Rent'), '2026-10-01', 100)$$,
  'P0002', null, 'Nobody can set a budget on someone else’s category'
);

-- Leo edits the Costco trip; Jeff's filing follows it to the new version.
select public.save_expense(
  p_group_id => '22222222-2222-2222-2222-222222222222',
  p_paid_by => '33333333-3333-3333-3333-333333330001',
  p_merchant => 'Costco (fixed)',
  p_expense_date => '2026-10-17',
  p_total_cents => 14000,
  p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 8300},
                {"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 1500},
                {"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 4200}]',
  p_replaces_expense_id => '44444444-4444-4444-4444-444444444444'
);
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$select merchant, category_id = tests.category_of(auth.uid(), 'Rent') from public.my_spending_items('2026-10-01')$$,
  $$values ('Costco (fixed)', true)$$,
  'After Leo edits the expense, Jeff’s share is still filed under his Rent'
);
select lives_ok(
  $$select public.set_share_category((select expense_id from public.get_my_shares()), null)$$,
  'Jeff clears the filing'
);
select results_eq(
  $$select category_id from public.my_spending_items('2026-10-01')$$,
  $$values (null::uuid)$$,
  'Cleared, it’s uncategorized again'
);

-- Forgiveness shows as its own item.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.forgive_debt('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330003', 1000);
select results_eq(
  $$select amount_cents, is_forgiveness from public.my_spending_items('2026-10-01') order by is_forgiveness$$,
  $$values (8300::bigint, false), (1000::bigint, true)$$,
  'A forgiven debt is listed as its own spending item'
);

select * from finish();
rollback;
