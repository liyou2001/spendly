-- Signing up, by email code or Google: the before-user-created hook refuses an email that
-- another account added as a receipt address, so one person doesn't end up with two accounts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create schema tests;
grant usage on schema tests to public;
create function tests.signup(p_email text) returns jsonb language sql as $$
  select public.hook_before_user_created(
    jsonb_build_object('metadata', '{}'::jsonb, 'user', jsonb_build_object('email', p_email))
  );
$$;
grant execute on all functions in schema tests to public;

-- Leo (seed) has a second address for forwarding receipts, and one he never confirmed.
insert into public.verified_emails (user_id, email, verified_at)
values
  ('11111111-1111-1111-1111-111111111111', 'leo.personal@gmail.com', now()),
  ('11111111-1111-1111-1111-111111111111', 'leo.old@gmail.com', null);

select is(tests.signup('sam@gmail.com'), '{}'::jsonb, 'A new email signs up');
select is(
  tests.signup(' Leo.Personal@gmail.com ') -> 'error' ->> 'http_code',
  '409',
  'Another account''s receipt address is refused, whatever its case or spaces'
);
select matches(
  tests.signup('leo.personal@gmail.com') -> 'error' ->> 'message',
  'already added to another Spendly account',
  'and the message says why'
);
select is(
  tests.signup('leo.old@gmail.com'),
  '{}'::jsonb,
  'An address that was never confirmed doesn''t block anyone'
);
select is(tests.signup(null), '{}'::jsonb, 'No email (nothing to check) is let through');

select ok(
  has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'),
  'Supabase Auth can call the hook'
);
select ok(
  not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute'),
  'and nobody using the app can'
);

select * from finish();
rollback;
