-- Receipt photos: your own folder only, and the monthly scan count.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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

select is(
  (select public from storage.buckets where id = 'receipts'), false, 'The receipts bucket is private'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('receipts', '11111111-1111-1111-1111-111111111111/costco.jpg')$$,
  'Leo uploads to his own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('receipts', 'aaaaaaaa-0000-0000-0000-000000000001/costco.jpg')$$,
  '42501', null, 'but not to anyone else’s'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'receipts'), 1, 'He sees his photo'
);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty(
  $$select * from storage.objects where bucket_id = 'receipts'$$, 'Nobody else can see it'
);

-- This month: a.jpg read twice (Haiku, then Sonnet), b.jpg read, c.jpg too blurry, d.jpg only
-- failed on our side (no API credits). Plus one from last month.
reset role;
create temp table before as
  select public.receipt_scans_this_month('11111111-1111-1111-1111-111111111111') as scans;
insert into public.receipt_extractions (user_id, source, storage_path, model, status, error, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'photo', 'a.jpg', 'claude-haiku-5-5', 'mismatch', null, now()),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'a.jpg', 'claude-sonnet-5-5', 'succeeded', null, now()),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'b.jpg', 'claude-haiku-5-5', 'succeeded', null, now()),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'c.jpg', 'claude-haiku-5-5', 'failed', 'Unreadable: too blurry', now()),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'd.jpg', 'claude-haiku-5-5', 'failed', 'Error: 400 credit balance too low', now()),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'old.jpg', 'claude-haiku-5-5', 'succeeded', null,
   date_trunc('month', now()) - interval '1 day');
select is(
  public.receipt_scans_this_month('11111111-1111-1111-1111-111111111111') - (select scans from before), 3,
  'Scans count photos a model read (a retry counts once), not failures on our side or last month'
);
select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.receipt_scans_this_month('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'Only Edge Functions call it'
);

select * from finish();
rollback;
