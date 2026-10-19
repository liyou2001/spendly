-- Editing an expense: save_expense with p_replaces_expense_id.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
-- The seeded Costco trip, edited so Maya's share is 4100 and Jeff's 1600.
create function tests.edit_costco(p_merchant text) returns uuid language sql as $$
  select public.save_expense(
    p_group_id => '22222222-2222-2222-2222-222222222222',
    p_paid_by => '33333333-3333-3333-3333-333333330001',
    p_merchant => p_merchant,
    p_expense_date => '2026-10-17',
    p_total_cents => 14000,
    p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 8300},
                  {"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 1600},
                  {"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 4100}]',
    p_replaces_expense_id => '44444444-4444-4444-4444-444444444444'
  );
$$;
grant execute on all functions in schema tests to public;

select tests.as_user('11111111-1111-1111-1111-111111111111');

-- A separate expense with forgiveness on it can't be edited.
select public.save_expense(
  p_group_id => '22222222-2222-2222-2222-222222222222',
  p_paid_by => '33333333-3333-3333-3333-333333330001',
  p_merchant => 'Snacks',
  p_expense_date => '2026-10-25',
  p_total_cents => 500,
  p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 500}]'
);
select public.forgive_debt('22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330003', 500);
select throws_ok(
  $$select public.save_expense(
      p_group_id => '22222222-2222-2222-2222-222222222222',
      p_paid_by => '33333333-3333-3333-3333-333333330001',
      p_merchant => 'Snacks (edited)',
      p_expense_date => '2026-10-25',
      p_total_cents => 600,
      p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 600}]',
      p_replaces_expense_id => (select id from public.expenses where merchant = 'Snacks'))$$,
  '22023',
  'A debt on this expense was forgiven, so it can’t be edited. Void it and add it again instead.',
  'An expense with forgiveness on it cannot be edited'
);
select is(
  (select voided_at from public.expenses where merchant = 'Snacks'),
  null,
  'The blocked edit leaves the original untouched'
);
select is_empty(
  $$select id from public.expenses where merchant = 'Snacks (edited)'$$,
  'and saves no replacement'
);

-- The Costco trip has no forgiveness, so it can be edited.
select lives_ok($$select tests.edit_costco('Costco (edited)')$$, 'An expense without forgiveness can be edited');
select results_eq(
  $$select p.display_name, b.amount_cents from public.balances() b
    join public.participants p on p.id = b.from_participant order by 1$$,
  $$values ('Jeff', 1600::bigint), ('Maya', 4100::bigint)$$,
  'Balances follow the edited version'
);

select * from finish();
rollback;
