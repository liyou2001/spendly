-- record_payment, claim_payment, decide_payment and forgive_debt.
-- Apartment: Leo ...0001 (paid the $140 Costco trip), Jeff ...0002, Maya ...0003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
-- Leo's balances with names, as he sees them.
create function tests.leo_balances() returns table (from_name text, to_name text, amount_cents bigint)
language sql security definer as $$
  select f.display_name, t.display_name, b.amount_cents
  from public.balances() b
  join public.participants f on f.id = b.from_participant
  join public.participants t on t.id = b.to_participant
  where b.group_id = '22222222-2222-2222-2222-222222222222'
  order by 1, 2;
$$;
grant execute on all functions in schema tests to public;

-- Jeff has an account, linked to his participant. Sam is in no shared group.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff@example.com', '{"display_name": "Jeff"}');
update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = '33333333-3333-3333-3333-333333330002';

-- Recording a repayment (counts immediately) --------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$select public.record_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330002', '33333333-3333-3333-3333-333333330001', 1500, 'venmo')$$,
  'Leo records "Jeff paid me $15.00"'
);
select results_eq(
  'select * from tests.leo_balances()',
  $$values ('Maya', 'Leo', 4200::bigint)$$,
  'Jeff is settled; Maya still owes 4200'
);
select lives_ok(
  $$select public.record_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330003', '33333333-3333-3333-3333-333333330001', 2000, 'cash')$$,
  'A partial payment can be recorded'
);
select results_eq(
  'select * from tests.leo_balances()',
  $$values ('Maya', 'Leo', 2200::bigint)$$,
  'Maya paid 2000 of 4200 and still owes 2200'
);
select throws_ok(
  $$select public.record_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330003', '33333333-3333-3333-3333-333333330002', 500)$$,
  '42501', null,
  'Leo cannot record a payment between two other people'
);
select throws_ok(
  $$select public.record_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330001', '33333333-3333-3333-3333-333333330002', 500)$$,
  '42501', null,
  'Paying someone who has the app is a claim they confirm, not something you record'
);
select lives_ok(
  $$select public.record_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330001', '33333333-3333-3333-3333-333333330003', 500)$$,
  'Paying someone without the app can be recorded by the payer'
);
select results_eq(
  'select * from tests.leo_balances()',
  $$values ('Maya', 'Leo', 2700::bigint)$$,
  'Leo paying Maya 500 adds to what she owes him'
);
select throws_ok(
  $$select public.claim_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330003', 500)$$,
  '22023', null,
  'Claims go to people with the app'
);

-- Claims between account holders: Jeff owes 4250 and says he paid 2000 ----------------
select public.save_expense(
  p_group_id => '22222222-2222-2222-2222-222222222222',
  p_paid_by => '33333333-3333-3333-3333-333333330001',
  p_merchant => 'Dinner',
  p_expense_date => '2026-10-20',
  p_total_cents => 8500,
  p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 4250},
                {"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 4250}]'
);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select lives_ok(
  $$select public.claim_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330001', 2000, 'venmo')$$,
  'Jeff says he paid Leo 2000'
);
select results_eq(
  $$select amount_cents from public.balances() where from_participant = '33333333-3333-3333-3333-333333330002'$$,
  $$values (4250::bigint)$$,
  'A claim does not change the balance'
);
select throws_ok(
  $$select public.decide_payment((select id from public.payments where status = 'claimed'), true)$$,
  'P0002', null,
  'Jeff cannot confirm his own claim'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.decide_payment((select id from public.payments where status = 'claimed'), true)$$,
  'Leo taps "Got it"'
);
select results_eq(
  $$select amount_cents from public.balances() where from_participant = '33333333-3333-3333-3333-333333330002'$$,
  $$values (2250::bigint)$$,
  'Jeff owed 4250, paid 2000, and still owes 2250'
);
select throws_ok(
  $$select public.decide_payment((select id from public.payments where amount_cents = 2000 and kind = 'payment' and method = 'venmo'), false)$$,
  'P0002', null,
  'A claim can only be decided once'
);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select public.claim_payment('22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330001', 2250);
select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.decide_payment((select id from public.payments where status = 'claimed'), false)$$,
  'Leo taps "Didn''t get it"'
);
select results_eq(
  $$select amount_cents from public.balances() where from_participant = '33333333-3333-3333-3333-333333330002'$$,
  $$values (2250::bigint)$$,
  'A rejected claim does not change the balance'
);

-- Forgiveness ---------------------------------------------------------------------
-- Maya owes 2700, all from the Costco trip. A newer expense adds 500 more.
select public.save_expense(
  p_group_id => '22222222-2222-2222-2222-222222222222',
  p_paid_by => '33333333-3333-3333-3333-333333330001',
  p_merchant => 'Snacks',
  p_expense_date => '2026-10-25',
  p_total_cents => 500,
  p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 500}]'
);

select throws_ok(
  $$select public.forgive_debt('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330003', 3201)$$,
  '22023', null,
  'You cannot forgive more than they owe you (3200)'
);
select lives_ok(
  $$select public.forgive_debt('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330003', 3200)$$,
  'Leo forgives everything Maya owes'
);
select results_eq(
  $$select e.merchant, p.amount_cents from public.payments p
    join public.expenses e on e.id = p.expense_id
    where p.kind = 'forgiveness' order by e.expense_date desc$$,
  $$values ('Snacks', 500::bigint), ('Costco', 2700::bigint)$$,
  'Forgiveness is spread over the expenses behind the debt, newest first'
);
select results_eq(
  'select * from tests.leo_balances()',
  $$values ('Jeff', 'Leo', 2250::bigint)$$,
  'Maya is settled; Jeff still owes 2250'
);

-- Outsiders ---------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.record_payment('22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333330002', '33333333-3333-3333-3333-333333330001', 100)$$,
  '42501', null,
  'Someone outside the group cannot record payments in it'
);

select * from finish();
rollback;
