-- Managing your own categories (Me → Categories).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
  $$insert into public.categories (name) values ('Textbooks')$$,
  'Leo adds a category by name alone'
);
select is(
  (select user_id from public.categories where name = 'Textbooks'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'It belongs to Leo without him setting user_id'
);
select lives_ok(
  $$update public.categories set name = 'Books' where name = 'Textbooks'$$,
  'Leo renames it'
);
select throws_ok(
  $$insert into public.categories (name) values ('groceries')$$,
  '23505', null,
  'A name he already has, in any capitalization, is rejected'
);
select throws_ok(
  $$insert into public.categories (name) values (repeat('a', 41))$$,
  '23514', null,
  'Names over 40 characters are rejected'
);
select throws_ok(
  $$insert into public.categories (user_id, name)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Planted')$$,
  '42501', null,
  'Nobody can create a category for someone else'
);
select throws_ok(
  $$update public.categories set user_id = 'aaaaaaaa-0000-0000-0000-000000000001' where name = 'Books'$$,
  '42501', null,
  'Nobody can hand a category to someone else'
);
select lives_ok(
  $$delete from public.categories where name = 'Books'$$,
  'An unused category can be deleted'
);
select throws_ok(
  $$delete from public.categories where name = 'Groceries'$$,
  '23503', null,
  'A category an expense uses (the seeded Costco trip) cannot be deleted'
);

-- Sam can't see, rename or delete Leo's categories.
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty(
  $$select * from public.categories where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'Another user cannot see Leo''s categories'
);
select is_empty(
  $$update public.categories set name = 'Hacked'
    where user_id = '11111111-1111-1111-1111-111111111111' returning id$$,
  'Another user cannot rename Leo''s categories'
);
select is_empty(
  $$delete from public.categories
    where user_id = '11111111-1111-1111-1111-111111111111' returning id$$,
  'Another user cannot delete Leo''s categories'
);

select * from finish();
rollback;
