-- Step 9: receipt photos. Each person uploads to their own folder in a private bucket
-- (receipts/<user id>/<file>), and only they can read it back. The extract-receipt Edge
-- Function reads it with the service role and logs every attempt in receipt_extractions.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg']);

create policy "Upload receipts to your own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Read your own receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create index receipt_extractions_user_month on public.receipt_extractions (user_id, created_at);

-- Photos scanned this calendar month (UTC), for the monthly limit. A Sonnet retry is part of
-- the same scan, so this counts photos, not attempts.
create function public.receipt_scans_this_month(p_user_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(distinct storage_path)::integer
  from public.receipt_extractions
  where user_id = p_user_id and source = 'photo'
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

revoke execute on function public.receipt_scans_this_month(uuid) from public, anon, authenticated;
grant execute on function public.receipt_scans_this_month(uuid) to service_role;
