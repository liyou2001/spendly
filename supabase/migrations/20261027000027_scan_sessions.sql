-- Scan sessions: every photo scanned for one expense (opening Add expense starts a session)
-- counts as one scan toward the monthly limit, up to 6 photos (a scan and 5 rescans). Each photo
-- is read once. And photos attached to an expense can no longer be deleted by anyone through
-- the app, so the photo a group checks its split against can't be removed or swapped.

alter table public.receipt_extractions add column scan_session uuid;
create index receipt_extractions_session on public.receipt_extractions (user_id, scan_session)
  where scan_session is not null;

-- A session counts once; scans without one (forwarded emails, older apps) count per photo.
create or replace function public.receipt_scans_this_month(p_user_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(distinct coalesce(scan_session::text, storage_path))::integer
  from public.receipt_extractions
  where user_id = p_user_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    and status in ('succeeded', 'mismatch', 'unreadable');
$$;

-- Attached photos -----------------------------------------------------------------------

-- Whether a photo is kept with an expense. Security definer so the storage policy below can ask
-- whatever the caller can see.
create function private.receipt_is_attached(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.expense_receipts where storage_path = p_name);
$$;

grant execute on function private.receipt_is_attached(text) to authenticated;

-- You can still delete your own scans, but not one attached to an expense. With no update
-- policy, a deleted name can't be overwritten either, so attached photos can't be swapped.
drop policy "Delete your own receipts" on storage.objects;
create policy "Delete your own receipts" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not private.receipt_is_attached(name)
  );
