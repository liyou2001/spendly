-- Forwarded email receipts: your addresses, codes to add more, finding whose email it is,
-- drafts, duplicates and Gmail forwarding codes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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
create table tests.codes (email text primary key, code text);
grant all on tests.codes to public;
grant execute on all functions in schema tests to public;

-- A new account's sign-in address is on its list straight away.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Sam@Example.com', '{"display_name": "Sam"}');
select results_eq(
  $$select email, is_sign_in, verified_at is not null from public.verified_emails
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  $$values ('sam@example.com', true, true)$$,
  'Signing up adds your sign-in address, lowercased and verified'
);

-- Changing your sign-in email moves the mark; the old address stays, removable.
update auth.users set email = 'sam.new@example.com' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq(
  $$select email, is_sign_in from public.verified_emails
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by email$$,
  $$values ('sam.new@example.com', true), ('sam@example.com', false)$$,
  'A new sign-in email becomes the sign-in address; the old one is ordinary'
);
select ok(
  exists (select 1 from cron.job where jobname = 'fail-stuck-inbound-emails'),
  'Emails stuck mid-read are failed on a schedule'
);

-- Adding another address with a code.
select tests.as_service();
insert into tests.codes values
  ('leo.work@example.com', public.email_code_create('11111111-1111-1111-1111-111111111111', ' Leo.Work@Example.com '));
select ok((select code ~ '^[0-9]{6}$' from tests.codes), 'A 6-digit code is made for the address');
select throws_ok(
  $$select public.email_code_create('11111111-1111-1111-1111-111111111111', 'not an email')$$,
  '22023', null, 'Only email addresses'
);
select throws_ok(
  $$select public.email_code_create('aaaaaaaa-0000-0000-0000-000000000001', 'leo@example.com')$$,
  '22023', null, 'Nobody can add an address another account has verified'
);
select is(
  public.inbound_find_user(array['leo.work@example.com']), null::uuid,
  'An address isn’t matched until it’s verified'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.verify_email('leo.work@example.com', '000000')$$,
  '22023', 'That code isn’t right', 'A wrong code is refused'
) where (select code from tests.codes) <> '000000';
select lives_ok(
  $$select public.verify_email('LEO.WORK@example.com', (select code from tests.codes))$$,
  'The emailed code verifies it'
);
select results_eq(
  $$select email, is_sign_in from public.verified_emails order by email$$,
  $$values ('leo.work@example.com', false), ('leo@example.com', true)$$,
  'Leo sees both of his addresses, and only his'
);
select throws_ok(
  $$select public.remove_email('leo@example.com')$$,
  '22023', null, 'The sign-in address can’t be removed'
);

-- Whose email is it?
select tests.as_service();
select is(
  public.inbound_find_user(array['nobody@example.com', 'Leo.Work@example.com']),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'A forwarded email from any of Leo’s verified addresses is his'
);
select is(public.inbound_find_user(array['stranger@example.com']), null::uuid, 'Strangers match no one');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.inbound_find_user(array['leo@example.com'])$$,
  '42501', null, 'Only Edge Functions can look up whose address it is'
);
select lives_ok($$select public.remove_email('leo.work@example.com')$$, 'Leo removes his work address');

-- Drafts and duplicates.
reset role;
insert into public.receipt_drafts (id, user_id, status, receipt)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ok',
        '{"merchant": "Amazon", "date": "2026-10-18", "total_cents": 4210, "items": []}');
select tests.as_service();
select ok(
  public.inbound_is_duplicate('11111111-1111-1111-1111-111111111111', 'costco', 14000, '2026-10-17'),
  'The Costco receipt again is a duplicate of the saved expense'
);
select ok(
  public.inbound_is_duplicate('11111111-1111-1111-1111-111111111111', 'Amazon', 4210, '2026-10-18'),
  'and the Amazon order again is a duplicate of its draft'
);
select ok(
  not public.inbound_is_duplicate('11111111-1111-1111-1111-111111111111', 'Amazon', 4211, '2026-10-18'),
  'A different total isn’t'
);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty($$select * from public.receipt_drafts$$, 'Nobody else sees Leo’s drafts');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.close_draft('dddddddd-0000-0000-0000-000000000001', true)$$,
  'Leo saves his draft as an expense'
);
select throws_ok(
  $$select public.close_draft('dddddddd-0000-0000-0000-000000000001', false)$$,
  'P0002', null, 'and it’s done: it can’t be closed twice'
);

select * from finish();
rollback;
