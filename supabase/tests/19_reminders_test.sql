-- Reminders for unpaid debts: which are due, through which channel, and when not to send.
-- Apartment: Leo ...0001 (paid the $140 Costco trip, has an account), Jeff ...0002 owes 1500,
-- Maya ...0003 owes 4200. Times are counted from when the Costco expense was saved.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
-- 2pm in New York (11am in Los Angeles) on the day `p_days` after Costco was saved.
create function tests.day(p_days integer, p_utc_hour integer default 18) returns timestamptz
language sql as $$
  select date_trunc('day', created_at at time zone 'UTC') at time zone 'UTC'
    + make_interval(days => p_days, hours => p_utc_hour)
  from public.expenses where id = '44444444-4444-4444-4444-444444444444';
$$;
-- What's due in the Apartment group, as (debtor, amount, channel, phone).
create function tests.due(p_at timestamptz)
returns table (debtor text, amount_cents bigint, channel text, phone text)
language sql as $$
  select debtor_name, amount_cents, channel, phone from public.due_reminders(p_at)
  where group_id = '22222222-2222-2222-2222-222222222222' order by debtor_name;
$$;
grant execute on all functions in schema tests to public;

-- Who can call it -----------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select * from public.due_reminders()$$, '42501', null,
  'The app can’t list reminders; only Edge Functions can'
);
select throws_ok(
  $$select public.set_time_zone('Mars/Olympus_Mons')$$, '22023', 'Unknown time zone',
  'An unknown time zone is refused'
);
select public.set_time_zone('America/New_York');
reset role;
select is(
  (select time_zone from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'America/New_York', 'Leo’s phone saves his time zone'
);

-- Channels ------------------------------------------------------------------------------
select is_empty(
  $$select * from tests.due(tests.day(4))$$,
  'With no way to reach anyone (no app, no texts, Leo without pushes), nothing is due'
);

insert into public.push_tokens (token, user_id)
values ('ExponentPushToken[leo-test]', '11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select * from tests.due(tests.day(4))$$,
  $$values ('Jeff', 1500::bigint, 'nudge', null::text), ('Maya', 4200::bigint, 'nudge', null::text)$$,
  'After 3 days, Leo is nudged to remind Jeff and Maya himself'
);

insert into public.sms_consents (phone, participant_id, source)
values ('+16085550123', '33333333-3333-3333-3333-333333330002', 'payment_page');
select results_eq(
  $$select * from tests.due(tests.day(4))$$,
  $$values ('Jeff', 1500::bigint, 'text', '+16085550123'), ('Maya', 4200::bigint, 'nudge', null::text)$$,
  'Jeff opted in on his payment link, so he gets a text'
);

-- When ------------------------------------------------------------------------------------
select is_empty($$select * from tests.due(tests.day(2))$$, 'Nothing before 3 days');
select is_empty(
  $$select * from tests.due(tests.day(4, 6))$$,
  'Nothing at 2am in Leo’s time zone'
);
update public.profiles set time_zone = null where id = '11111111-1111-1111-1111-111111111111';
select is_empty(
  $$select * from tests.due(tests.day(4, 14))$$,
  'Without a time zone, 10am in New York is still 7am in Los Angeles: wait'
);
select is(
  (select count(*)::int from tests.due(tests.day(4, 20))),
  2, 'and 4pm in New York (1pm in Los Angeles) is fine'
);
update public.profiles set time_zone = 'America/New_York'
where id = '11111111-1111-1111-1111-111111111111';

-- Not again so soon, not while a payment waits ---------------------------------------------
insert into public.reminders (group_id, debtor_id, creditor_id, amount_cents, channel, created_at)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330002',
        '33333333-3333-3333-3333-333333330001', 1500, 'text', tests.day(3));
select results_eq(
  $$select debtor from tests.due(tests.day(4))$$, $$values ('Maya')$$,
  'Jeff was reminded a day ago, so not again yet'
);
select results_eq(
  $$select debtor from tests.due(tests.day(7))$$, $$values ('Jeff'), ('Maya')$$,
  'but 4 days later he is'
);

insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330003',
        '33333333-3333-3333-3333-333333330001', 4200, 'payment', 'claimed');
select results_eq(
  $$select debtor from tests.due(tests.day(7))$$, $$values ('Jeff')$$,
  'Maya says she paid and Leo hasn’t confirmed yet: no reminder for her'
);

-- How old a debt is ---------------------------------------------------------------------------
-- Jeff pays the 1500 from Costco, then Leo pays a $30 pizza on day 6 that Jeff owes $10 of.
-- What Jeff owes now is only from the pizza, 1 day old on day 7.
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status,
                             recorded_by, decided_by, decided_at)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330002',
        '33333333-3333-3333-3333-333333330001', 1500, 'payment', 'confirmed',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());
insert into public.expenses (id, group_id, paid_by, merchant, expense_date, total_cents, created_by,
                             created_at)
values ('dddddddd-0000-0000-0000-000000000019', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333330001', 'Pizza', current_date, 3000,
        '11111111-1111-1111-1111-111111111111', tests.day(6));
insert into public.shares (expense_id, participant_id, amount_cents)
values ('dddddddd-0000-0000-0000-000000000019', '33333333-3333-3333-3333-333333330001', 1000),
       ('dddddddd-0000-0000-0000-000000000019', '33333333-3333-3333-3333-333333330002', 1000),
       ('dddddddd-0000-0000-0000-000000000019', '33333333-3333-3333-3333-333333330003', 1000);
select is_empty(
  $$select * from tests.due(tests.day(7)) where debtor = 'Jeff'$$,
  'Payments cover the oldest expenses first, so Jeff’s $10 is only a day old'
);

select * from finish();
rollback;
