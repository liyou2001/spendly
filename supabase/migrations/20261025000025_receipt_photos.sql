-- Receipt photos kept with their expense, so everyone in the group can check the split against
-- the receipt (Rule 5). A scanned photo stays in its uploader's folder; attaching it to an
-- expense is what lets the group read it. Photos that never get attached are deleted daily by
-- the clean-receipts Edge Function (Storage refuses deletes through SQL).

-- Which photo goes with which expense. Append-only, like the expense itself.
create table public.expense_receipts (
  expense_id uuid primary key references public.expenses,
  storage_path text not null,
  attached_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);

create index expense_receipts_storage_path on public.expense_receipts (storage_path);

create trigger expense_receipts_no_update before update on public.expense_receipts
  for each row execute function private.forbid_ledger_change();
create trigger expense_receipts_no_delete before delete on public.expense_receipts
  for each row execute function private.forbid_ledger_change();
create trigger expense_receipts_no_truncate before truncate on public.expense_receipts
  for each statement execute function private.forbid_ledger_change();

alter table public.expense_receipts enable row level security;
revoke all on public.expense_receipts from anon, authenticated;
revoke update, delete, truncate on public.expense_receipts from service_role;
grant select on public.expense_receipts to authenticated;

create policy "Read photos of expenses you can see" on public.expense_receipts
  for select to authenticated
  using (private.can_see_expense(expense_id));

-- Attaching -------------------------------------------------------------------------

-- Whoever entered an expense attaches the photo they scanned for it, once. The photo must be
-- one of their own uploads.
create function public.attach_receipt(p_expense_id uuid, p_path text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (
    select 1 from public.expenses
    where id = p_expense_id and created_by = caller and voided_at is null
  ) then
    raise exception 'You can only add a photo to an expense you entered'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_path is null
     or p_path !~ ('^' || caller::text || '/[0-9a-f-]{36}\.jpg$')
     or not exists (
       select 1 from storage.objects where bucket_id = 'receipts' and name = p_path
     )
  then
    raise exception 'Couldn’t find that photo' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.expense_receipts where expense_id = p_expense_id) then
    raise exception 'This expense already has a photo' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.expense_receipts (expense_id, storage_path, attached_by)
  values (p_expense_id, p_path, caller);
end;
$$;

-- An edited expense (a replacement) keeps the original's photo.
create function private.copy_receipt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.replaces_expense_id is not null then
    insert into public.expense_receipts (expense_id, storage_path, attached_by, created_at)
      select new.id, storage_path, attached_by, created_at
      from public.expense_receipts
      where expense_id = new.replaces_expense_id;
  end if;
  return new;
end;
$$;

create trigger expenses_copy_receipt
  after insert on public.expenses
  for each row execute function private.copy_receipt();

-- Reading ---------------------------------------------------------------------------

-- Whether a photo belongs to an expense you can see. Security definer so the storage policy
-- below can look at expenses without going through their RLS.
create function private.can_see_receipt(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.expense_receipts r
    where r.storage_path = p_name and private.can_see_expense(r.expense_id)
  );
$$;

create policy "Read photos of expenses you can see" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and private.can_see_receipt(name));

-- Cleaning up -----------------------------------------------------------------------

-- Photos uploaded before p_older_than that no expense uses: scans that were never saved, saved
-- without the photo, or scanned again. For clean-receipts, which deletes them.
create function public.unattached_receipts(p_older_than timestamptz)
returns setof text
language sql stable security definer set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'receipts' and o.created_at < p_older_than
    and not exists (select 1 from public.expense_receipts r where r.storage_path = o.name)
  order by o.created_at
  limit 1000;
$$;

-- Daily: ask clean-receipts to delete them. Uses the same Vault secrets as send-reminders.
create function private.request_receipt_cleanup()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(url, '/') || '/functions/v1/clean-receipts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

select cron.schedule('clean-receipts', '47 4 * * *', 'select private.request_receipt_cleanup()');

-- Grants -----------------------------------------------------------------------------

revoke execute on function public.attach_receipt(uuid, text), public.unattached_receipts(timestamptz)
from public, anon, authenticated;
grant execute on function public.attach_receipt(uuid, text) to authenticated;
-- Only Edge Functions call this.
grant execute on function public.unattached_receipts(timestamptz) to service_role;

revoke execute on all functions in schema private from public, anon;
-- The storage policy runs as the person reading.
grant execute on function private.can_see_receipt(text) to authenticated;
