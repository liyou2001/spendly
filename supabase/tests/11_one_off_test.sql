-- One-off groups: created with create_group(..., p_one_off => true), otherwise ordinary groups.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}');

select tests.as_user('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$select public.create_group('Ana and Ben · Oct 19',
      '[{"display_name": "Ana"}, {"display_name": "Ben"}]', p_one_off => true)$$,
  'Leo starts a one-off with Ana and Ben'
);
select results_eq(
  $$select g.is_one_off, g.is_personal, count(p.*)
    from public.groups g join public.participants p on p.group_id = g.id
    where g.name = 'Ana and Ben · Oct 19' group by g.id$$,
  $$values (true, false, 3::bigint)$$,
  'It is a one-off (not Personal) with Leo, Ana and Ben'
);
select throws_ok(
  $$select public.create_group('Just me', '[]', p_one_off => true)$$,
  '22023', null,
  'A one-off needs at least one other person'
);
select lives_ok(
  $$select public.create_group('Book club')$$,
  'Regular groups still work as before, and are not one-offs'
);
select is(
  (select is_one_off from public.groups where name = 'Book club'),
  false,
  'A group made without p_one_off is a regular group'
);

-- Splitting and settling up work like in any group.
select public.save_expense(
  p_group_id => (select id from public.groups where name = 'Ana and Ben · Oct 19'),
  p_paid_by => (select p.id from public.participants p join public.groups g on g.id = p.group_id
                where g.name = 'Ana and Ben · Oct 19' and p.user_id is not null),
  p_merchant => 'Dinner',
  p_expense_date => '2026-10-19',
  p_total_cents => 6000,
  p_shares => (select jsonb_agg(jsonb_build_object('participant_id', p.id, 'amount_cents', 2000))
               from public.participants p join public.groups g on g.id = p.group_id
               where g.name = 'Ana and Ben · Oct 19')
);
select results_eq(
  $$select p.display_name, b.amount_cents from public.balances() b
    join public.participants p on p.id = b.from_participant
    join public.groups g on g.id = b.group_id
    where g.is_one_off order by 1$$,
  $$values ('Ana', 2000::bigint), ('Ben', 2000::bigint)$$,
  'Ana and Ben each owe Leo 2000 for dinner'
);
select public.record_payment(
  (select id from public.groups where name = 'Ana and Ben · Oct 19'),
  (select p.id from public.participants p join public.groups g on g.id = p.group_id
   where g.name = 'Ana and Ben · Oct 19' and p.display_name = 'Ana'),
  (select p.id from public.participants p join public.groups g on g.id = p.group_id
   where g.name = 'Ana and Ben · Oct 19' and p.user_id is not null),
  2000
);
select results_eq(
  $$select p.display_name from public.balances() b
    join public.participants p on p.id = b.from_participant
    join public.groups g on g.id = b.group_id where g.is_one_off$$,
  $$values ('Ben')$$,
  'After Ana pays, only Ben still owes'
);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty(
  $$select * from public.groups where is_one_off$$,
  'Another user cannot see Leo''s one-off'
);

select * from finish();
rollback;
