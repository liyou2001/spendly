-- Receipt photos: whoever entered an expense attaches their own scan to it once; then everyone in
-- the group can see it, nobody else can, an edit keeps it, and unattached photos are listed for
-- cleanup.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to public;

-- Jeff signs up and is linked to the Jeff participant. Sam isn't in the Apartment.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff@example.com', '{"display_name": "Jeff"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'sam@example.com', '{"display_name": "Sam"}');
update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = '33333333-3333-3333-3333-333333330002';

-- Leo's scan of the Costco receipt, and a scan he never saved.
select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name) values
  ('receipts', '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000001.jpg'),
  ('receipts', '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000002.jpg');
-- One of Jeff's.
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
insert into storage.objects (bucket_id, name) values
  ('receipts', 'aaaaaaaa-0000-0000-0000-000000000002/0c0c0c0c-0000-0000-0000-000000000003.jpg');

select is_empty(
  $$select 1 from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000001.jpg'$$,
  'Before it''s attached, Jeff can''t see Leo''s photo'
);
select throws_ok(
  $$select public.attach_receipt('44444444-4444-4444-4444-444444444444',
      'aaaaaaaa-0000-0000-0000-000000000002/0c0c0c0c-0000-0000-0000-000000000003.jpg')$$,
  '22023', 'You can only add a photo to an expense you entered',
  'Jeff can''t add a photo to an expense Leo entered'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.attach_receipt('44444444-4444-4444-4444-444444444444',
      'aaaaaaaa-0000-0000-0000-000000000002/0c0c0c0c-0000-0000-0000-000000000003.jpg')$$,
  '22023', 'Couldn’t find that photo',
  'Leo can''t attach a photo from someone else''s folder'
);
select throws_ok(
  $$select public.attach_receipt('44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-00000000ffff.jpg')$$,
  '22023', 'Couldn’t find that photo',
  'Leo can''t attach a photo that was never uploaded'
);
select lives_ok(
  $$select public.attach_receipt('44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000001.jpg')$$,
  'Leo attaches his scan to the Costco expense'
);
select throws_ok(
  $$select public.attach_receipt('44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000002.jpg')$$,
  '22023', 'This expense already has a photo',
  'An expense gets one photo'
);
select throws_ok(
  $$update public.expense_receipts set storage_path = 'x'$$, '42501', null,
  'Leo can''t change which photo an expense has'
);
select throws_ok(
  $$delete from public.expense_receipts$$, '42501', null,
  'or remove it'
);

-- Everyone in the group sees it.
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$select name from storage.objects where bucket_id = 'receipts'
    and name like '11111111-1111-1111-1111-111111111111/%'$$,
  $$values ('11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000001.jpg')$$,
  'Jeff can read the attached photo, and not Leo''s unsaved scan'
);
select results_eq(
  $$select expense_id, storage_path from public.expense_receipts$$,
  $$values ('44444444-4444-4444-4444-444444444444'::uuid,
            '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000001.jpg')$$,
  'Jeff sees which photo goes with the Costco expense'
);

-- Nobody outside it does.
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000003');
select is_empty(
  $$select 1 from storage.objects where bucket_id = 'receipts'$$,
  'Sam, outside the Apartment, can''t read any of these photos'
);
select is_empty($$select 1 from public.expense_receipts$$, 'or see that the expense has one');

-- Editing keeps the photo.
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.save_expense(
  p_group_id => '22222222-2222-2222-2222-222222222222',
  p_paid_by => '33333333-3333-3333-3333-333333330001',
  p_merchant => 'Costco (edited)',
  p_expense_date => '2026-10-17',
  p_total_cents => 14000,
  p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 8300},
                {"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 1600},
                {"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 4100}]',
  p_replaces_expense_id => '44444444-4444-4444-4444-444444444444'
);
select results_eq(
  $$select r.storage_path from public.expense_receipts r
    join public.expenses e on e.id = r.expense_id where e.merchant = 'Costco (edited)'$$,
  $$values ('11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000001.jpg')$$,
  'The edited version keeps the original''s photo'
);
select results_eq(
  $$select count(*)::integer from public.expense_receipts
    where expense_id = '44444444-4444-4444-4444-444444444444'$$,
  $$values (1)$$,
  'and the voided original keeps it too'
);
select throws_ok(
  $$select public.attach_receipt('44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000002.jpg')$$,
  '22023', 'You can only add a photo to an expense you entered',
  'A voided expense can''t get a photo'
);

-- Cleanup.
select throws_ok(
  $$select public.unattached_receipts(now())$$, '42501', null,
  'The app can''t list photos for cleanup'
);
reset role;
update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'receipts';
set local role service_role;
select results_eq(
  $$select * from public.unattached_receipts(now() - interval '1 day') order by 1$$,
  $$values ('11111111-1111-1111-1111-111111111111/0c0c0c0c-0000-0000-0000-000000000002.jpg'),
           ('aaaaaaaa-0000-0000-0000-000000000002/0c0c0c0c-0000-0000-0000-000000000003.jpg')$$,
  'Cleanup lists old photos no expense uses, never an attached one'
);
select is_empty(
  $$select * from public.unattached_receipts(now() - interval '3 days')$$,
  'and none uploaded since the cutoff'
);

select * from finish();
rollback;
