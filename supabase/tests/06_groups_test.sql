-- create_group, and adding people to a group afterwards.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
  $$select public.create_group('Ski trip', '[{"display_name": " Priya "}, {"display_name": "Tom", "phone": "+16085551234"}]')$$,
  'Leo creates a group with two name-only people'
);
select results_eq(
  $$select p.display_name, p.user_id, p.phone::text from public.participants p
    join public.groups g on g.id = p.group_id
    where g.name = 'Ski trip' order by p.created_at, p.display_name$$,
  $$values ('Leo', '11111111-1111-1111-1111-111111111111'::uuid, null::text),
           ('Priya', null::uuid, null::text),
           ('Tom', null::uuid, '+16085551234')$$,
  'The group has Leo (with his account) plus Priya and Tom, names trimmed'
);
select results_eq(
  $$select p.display_name from public.participants p
    join public.groups g on g.id = p.group_id
    where g.name = 'Ski trip' order by p.created_at$$,
  $$values ('Leo'), ('Priya'), ('Tom')$$,
  'Ordered by when they were added alone: the creator first, then people in the order given'
);
select is(
  (select count(distinct p.created_at) from public.participants p
   join public.groups g on g.id = p.group_id where g.name = 'Ski trip'),
  3::bigint,
  'Everyone added in one go still gets their own timestamp, so the order never ties'
);
select results_eq(
  $$select is_personal, created_by from public.groups where name = 'Ski trip'$$,
  $$values (false, '11111111-1111-1111-1111-111111111111'::uuid)$$,
  'It is a shared group created by Leo'
);
select lives_ok(
  $$insert into public.participants (group_id, display_name)
    select id, 'Late addition' from public.groups where name = 'Ski trip'$$,
  'A member can add another person later'
);
select lives_ok(
  $$select public.create_group('Just me')$$,
  'A group can start with only its creator'
);

select throws_ok(
  $$select public.create_group('Bad phone', '[{"display_name": "Ann", "phone": "608-555-1234"}]')$$,
  '23514', null,
  'Phone numbers must be in +1... (E.164) form'
);
select throws_ok(
  $$select public.create_group('   ')$$,
  '23514', null,
  'A group needs a name'
);
select throws_ok(
  $$select public.create_group('No name person', '[{"display_name": ""}]')$$,
  '23514', null,
  'Every person needs a name'
);

-- Someone else can't see it.
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty(
  $$select * from public.groups where name = 'Ski trip'$$,
  'Another user cannot see the new group'
);

select * from finish();
rollback;
