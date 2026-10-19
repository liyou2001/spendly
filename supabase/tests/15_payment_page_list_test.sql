-- The payment page lists the expenses behind what's owed now: newest first, until they cover it.
-- Apartment: Leo ...0001 paid the Costco trip (Jeff's share $15.00). Here he also pays $10.00
-- at Target for Jeff, then Jeff pays him back in steps.
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
create table tests.page_link (token text);
grant all on tests.page_link to public;
-- What Jeff's page lists, as service_role would see it.
create function tests.listed() returns table (merchants text, earlier integer)
language sql security definer as $$
  with page as (
    select public.link_share(encode(extensions.digest((select token from tests.page_link), 'sha256'), 'hex')) as body
  )
  select coalesce(string_agg(e->>'merchant', ', '), ''), (body->>'earlier_count')::integer
  from page left join lateral jsonb_array_elements(body->'expenses') e on true
  group by body;
$$;
grant execute on all functions in schema tests to public;

select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into tests.page_link select public.create_share_link('33333333-3333-3333-3333-333333330002');
select public.save_expense(
  p_group_id => '22222222-2222-2222-2222-222222222222',
  p_paid_by => '33333333-3333-3333-3333-333333330001',
  p_merchant => 'Target',
  p_expense_date => '2026-10-18',
  p_total_cents => 1000,
  p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 1000}]'
);

select results_eq('select * from tests.listed()', $$values ('Target, Costco', 0)$$,
  'Jeff owes $25.00: both expenses, newest first');

select public.record_payment('22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330002', '33333333-3333-3333-3333-333333330001', 1200);
select results_eq('select * from tests.listed()', $$values ('Target, Costco', 0)$$,
  'After paying $12.00, $13.00 is still more than Target alone, so Costco stays');

select public.record_payment('22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330002', '33333333-3333-3333-3333-333333330001', 300);
select results_eq('select * from tests.listed()', $$values ('Target', 1)$$,
  'Owing $10.00, only Target is listed; Costco counts as paid off');

select public.record_payment('22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330002', '33333333-3333-3333-3333-333333330001', 1000);
select results_eq('select * from tests.listed()', $$values ('', 2)$$,
  'Settled: nothing is listed');

reset role;
select ok(
  exists (select 1 from cron.job where jobname = 'auto-confirm-claims' and command like '%auto_confirm_claims%'),
  'Auto-confirm runs on a schedule'
);

select * from finish();
rollback;
