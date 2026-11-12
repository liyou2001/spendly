-- First and last names: set together through set_my_name(), which builds the name people see.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to public;

select is(
  (select first_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'A new account has no name yet, so the app asks for one'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.set_my_name('  Leo ', ' Li ')$$, 'Leo sets his name');
select results_eq(
  $$select first_name, last_name, display_name from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('Leo', 'Li', 'Leo Li')$$,
  'Names are trimmed, and the name people see is "First Last"'
);
select results_eq(
  $$select distinct display_name from public.participants
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('Leo Li')$$,
  'His groups show the new name'
);
select throws_ok(
  $$select public.set_my_name('Leo', '  ')$$, '22023', 'Enter your last name.',
  'The last name is required'
);
select throws_ok(
  $$select public.set_my_name('', 'Li')$$, '22023', 'Enter your first name.',
  'and so is the first'
);
select throws_ok(
  $$select public.set_my_name(repeat('a', 41), 'Li')$$, '22023',
  'Keep each name to 40 characters or fewer.',
  'Names are at most 40 characters'
);
select throws_ok(
  $$update public.profiles set display_name = 'Someone else'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'The name people see can''t be set directly, only through set_my_name'
);

reset role;
select throws_ok(
  $$update public.profiles set last_name = null where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'A first name without a last name is refused, even by the database owner'
);

select * from finish();
rollback;
