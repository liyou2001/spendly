-- Schema-wide guarantees and the signup trigger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Every table in public has row-level security, so a new table can't ship open by accident.
select is(
  (select array_agg(tablename::text order by tablename) from pg_tables
   where schemaname = 'public' and not rowsecurity),
  null,
  'Every public table has row-level security enabled'
);

-- Nothing is readable without signing in.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')),
  null,
  'anon has no privileges on any public table or view'
);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
  null,
  'anon cannot execute any public function'
);

-- Ledger tables are read-only for the app.
select is(
  (select array_agg(t order by t) from unnest(array[
     'expenses', 'expense_items', 'item_assignments', 'shares', 'payments']) as t
   where has_table_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE, DELETE, TRUNCATE')),
  null,
  'authenticated cannot write ledger tables directly'
);
select is(
  (select array_agg(t order by t) from unnest(array[
     'expenses', 'expense_items', 'item_assignments', 'shares', 'payments']) as t
   where has_table_privilege('service_role', 'public.' || t, 'UPDATE, DELETE, TRUNCATE')),
  null,
  'service_role cannot update, delete or truncate ledger tables'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'user_id', 'UPDATE'),
  'Nobody can re-point a participant to a different account'
);

-- Signup creates a profile, a Personal group with the user in it, and default categories.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'riley.k@example.com', '{}');

select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Sam',
  'Signup creates a profile with the display name from sign-up'
);
select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'riley.k',
  'Without a display name, the profile uses the email name'
);
select results_eq(
  $$select name, is_personal from public.groups
    where created_by = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  $$values ('Personal', true)$$,
  'Signup creates exactly one Personal group'
);
select results_eq(
  $$select p.display_name, p.user_id from public.participants p
    join public.groups g on g.id = p.group_id
    where g.created_by = 'aaaaaaaa-0000-0000-0000-000000000001' and g.is_personal$$,
  $$values ('Sam', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid)$$,
  'The user is the only participant in their Personal group'
);
select results_eq(
  $$select name from public.categories
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by name$$,
  $$values ('Dining'), ('Fun'), ('Groceries'), ('Other'), ('Rent'), ('Transport')$$,
  'Signup creates the default categories'
);
select throws_ok(
  $$insert into public.groups (name, created_by, is_personal)
    values ('Another', 'aaaaaaaa-0000-0000-0000-000000000001', true)$$,
  '23505',
  null,
  'A user cannot have a second Personal group'
);

-- The seed matches the plan's Costco example.
select results_eq(
  $$select p.display_name, s.amount_cents from public.shares s
    join public.participants p on p.id = s.participant_id order by p.display_name$$,
  $$values ('Jeff', 1500::bigint), ('Leo', 8300::bigint), ('Maya', 4200::bigint)$$,
  'Seeded Costco shares are Jeff 1500, Leo 8300, Maya 4200'
);
select is(
  (select total_cents from public.expenses where id = '44444444-4444-4444-4444-444444444444'),
  14000::bigint,
  'Seeded Costco total is 14000'
);
select is(
  (select count(*) from public.participants
   where group_id = '22222222-2222-2222-2222-222222222222' and user_id is null),
  2::bigint,
  'Jeff and Maya are name-only'
);

-- Budgets use the owner's own categories and the first day of a month.
select throws_ok(
  $$insert into public.budgets (user_id, category_id, month, amount_cents)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            (select id from public.categories
             where user_id = '11111111-1111-1111-1111-111111111111' and name = 'Groceries'),
            '2026-10-01', 30000)$$,
  '23503',
  null,
  'A budget cannot use another user''s category'
);

select * from finish();
rollback;
