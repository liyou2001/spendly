-- Rule 2: ledger rows can't be updated or deleted.
-- Only voiding an expense and deciding a claimed payment are allowed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
grant execute on all functions in schema tests to public;

-- A claimed payment from Jeff to Leo, to test status changes on.
insert into public.payments (id, group_id, from_participant, to_participant, amount_cents, kind, status)
values ('ffffffff-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333330002', '33333333-3333-3333-3333-333333330001',
        1500, 'payment', 'claimed');

-- The app (signed in as Leo, the payer) --------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');

select throws_ok($$update public.expenses set merchant = 'Edited'$$, '42501', null, 'App cannot update expenses');
select throws_ok($$update public.expense_items set amount_cents = 1$$, '42501', null, 'App cannot update items');
select throws_ok($$update public.item_assignments set participant_id = participant_id$$, '42501', null, 'App cannot update assignments');
select throws_ok($$update public.shares set amount_cents = 0$$, '42501', null, 'App cannot update shares');
select throws_ok($$update public.payments set status = 'confirmed'$$, '42501', null, 'App cannot update payments');
select throws_ok($$delete from public.expenses$$, '42501', null, 'App cannot delete expenses');
select throws_ok($$delete from public.expense_items$$, '42501', null, 'App cannot delete items');
select throws_ok($$delete from public.item_assignments$$, '42501', null, 'App cannot delete assignments');
select throws_ok($$delete from public.shares$$, '42501', null, 'App cannot delete shares');
select throws_ok($$delete from public.payments$$, '42501', null, 'App cannot delete payments');
select throws_ok(
  $$insert into public.shares (expense_id, participant_id, amount_cents)
    values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333330002', 1)$$,
  '42501', null,
  'App cannot insert ledger rows directly (only through save_expense)'
);

-- Edge Functions (service_role) ----------------------------------------------------------
select tests.as_service();

select throws_ok($$update public.expenses set merchant = 'Edited'$$, '42501', null, 'service_role cannot update expenses');
select throws_ok($$update public.shares set amount_cents = 0$$, '42501', null, 'service_role cannot update shares');
select throws_ok($$delete from public.shares$$, '42501', null, 'service_role cannot delete shares');
select throws_ok($$delete from public.payments$$, '42501', null, 'service_role cannot delete payments');

-- Even the table owner is blocked by triggers ----------------------------------------------
select tests.as_owner();

select throws_ok($$update public.expenses set merchant = 'Edited'$$, '23001', null, 'Owner cannot edit an expense');
select throws_ok($$update public.expenses set total_cents = 1$$, '23001', null, 'Owner cannot change a total');
select throws_ok($$update public.expense_items set amount_cents = 1$$, '23001', null, 'Owner cannot edit items');
select throws_ok($$update public.item_assignments set participant_id = participant_id$$, '23001', null, 'Owner cannot edit assignments');
select throws_ok($$update public.shares set amount_cents = amount_cents$$, '23001', null, 'Owner cannot edit shares, even to the same value');
select throws_ok($$delete from public.shares$$, '23001', null, 'Owner cannot delete shares');
select throws_ok($$delete from public.expenses$$, '23001', null, 'Owner cannot delete expenses');
select throws_ok($$truncate public.shares cascade$$, '23001', null, 'Owner cannot truncate ledger tables');

-- Allowed: voiding once.
select lives_ok(
  $$update public.expenses set voided_at = now(), voided_by = '11111111-1111-1111-1111-111111111111'
    where id = '44444444-4444-4444-4444-444444444444'$$,
  'Voiding an expense is allowed'
);
select throws_ok(
  $$update public.expenses set voided_at = null, voided_by = null
    where id = '44444444-4444-4444-4444-444444444444'$$,
  '23001', null,
  'Un-voiding is not allowed'
);
select throws_ok(
  $$update public.expenses set voided_at = now() - interval '1 day'
    where id = '44444444-4444-4444-4444-444444444444'$$,
  '23001', null,
  'Changing when it was voided is not allowed'
);

-- Allowed: deciding a claimed payment once.
select throws_ok(
  $$update public.payments set amount_cents = 1
    where id = 'ffffffff-0000-0000-0000-000000000001'$$,
  '23001', null,
  'A claim''s amount cannot change'
);
select lives_ok(
  $$update public.payments
    set status = 'confirmed', decided_by = '11111111-1111-1111-1111-111111111111', decided_at = now()
    where id = 'ffffffff-0000-0000-0000-000000000001'$$,
  'Confirming a claimed payment is allowed'
);
select throws_ok(
  $$update public.payments
    set status = 'rejected', decided_by = '11111111-1111-1111-1111-111111111111', decided_at = now()
    where id = 'ffffffff-0000-0000-0000-000000000001'$$,
  '23001', null,
  'A decided payment cannot be changed again'
);

-- Forgiveness rules.
select throws_ok(
  $$insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind,
                                 expense_id, status, decided_by, decided_at)
    values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330003',
            '33333333-3333-3333-3333-333333330002', 1500, 'forgiveness',
            '44444444-4444-4444-4444-444444444444', 'confirmed',
            '11111111-1111-1111-1111-111111111111', now())$$,
  '23514', null,
  'Only the payer of an expense can forgive debts on it'
);
select throws_ok(
  $$insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind,
                                 expense_id, status)
    values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330002',
            '33333333-3333-3333-3333-333333330001', 1500, 'forgiveness',
            '44444444-4444-4444-4444-444444444444', 'claimed')$$,
  '23514', null,
  'Forgiveness is never just a claim'
);

select * from finish();
rollback;
