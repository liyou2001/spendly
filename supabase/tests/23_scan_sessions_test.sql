-- Scan sessions count once toward the monthly limit; attached photos can't be deleted.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Leo: three photos for one expense (a scan and two rescans), one with no session (a forwarded
-- email), and one that failed on our side.
insert into public.receipt_extractions (user_id, source, storage_path, scan_session, status) values
  ('11111111-1111-1111-1111-111111111111', 'photo', 'a.jpg', '5e550000-0000-0000-0000-000000000001', 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'b.jpg', '5e550000-0000-0000-0000-000000000001', 'unreadable'),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'c.jpg', '5e550000-0000-0000-0000-000000000001', 'mismatch'),
  ('11111111-1111-1111-1111-111111111111', 'email', 'email:1', null, 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'photo', 'd.jpg', '5e550000-0000-0000-0000-000000000002', 'failed');

select is(
  public.receipt_scans_this_month('11111111-1111-1111-1111-111111111111'),
  2,
  'Three photos for one expense count as one scan, the email as another, the failure not at all'
);

-- A second expense's scan counts on its own.
insert into public.receipt_extractions (user_id, source, storage_path, scan_session, status)
values ('11111111-1111-1111-1111-111111111111', 'photo', 'e.jpg', '5e550000-0000-0000-0000-000000000003', 'succeeded');
select is(
  public.receipt_scans_this_month('11111111-1111-1111-1111-111111111111'),
  3,
  'Another expense is another scan'
);

-- Last month's scans don't count.
update public.receipt_extractions set created_at = now() - interval '40 days' where storage_path = 'e.jpg';
select is(
  public.receipt_scans_this_month('11111111-1111-1111-1111-111111111111'),
  2,
  'Only this month counts'
);

-- Deleting: your own scans, but never one attached to an expense (Storage refuses deletes
-- through SQL, so the policy itself is checked; the Storage API is tested in the functions).
select ok(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'Delete your own receipts')
    like '%receipt_is_attached%',
  'The delete policy leaves attached photos alone'
);
insert into public.expense_receipts (expense_id, storage_path, attached_by)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111/x.jpg',
        '11111111-1111-1111-1111-111111111111');
select ok(
  private.receipt_is_attached('11111111-1111-1111-1111-111111111111/x.jpg')
    and not private.receipt_is_attached('11111111-1111-1111-1111-111111111111/y.jpg'),
  'receipt_is_attached tells attached photos from the rest'
);

select * from finish();
rollback;
