-- Step 10: forwarded email receipts. Everyone forwards to one shared address; the sender's
-- address, checked against each person's verified addresses, says whose receipt it is. The raw
-- email is never stored: inbound_emails keeps only who sent it and what happened.

-- Your addresses ------------------------------------------------------------------------

-- The address you sign in with is always on your list (signing in proved it's yours), and
-- can't be removed.
alter table public.verified_emails add column is_sign_in boolean not null default false;

create function private.sync_sign_in_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- A changed sign-in email: the old one becomes an ordinary address you can remove.
  update public.verified_emails set is_sign_in = false
  where user_id = new.id and is_sign_in and email <> lower(coalesce(new.email, ''));
  if new.email is not null then
    begin
      insert into public.verified_emails (user_id, email, verified_at, is_sign_in)
      values (new.id, lower(new.email), now(), true)
      on conflict (user_id, email) do update
        set verified_at = coalesce(public.verified_emails.verified_at, now()), is_sign_in = true;
    exception when unique_violation then
      -- Someone else already verified this address; signing up must still work.
      null;
    end;
  end if;
  return new;
end;
$$;

create trigger auth_users_sign_in_email
  after insert or update of email on auth.users
  for each row execute function private.sync_sign_in_email();

insert into public.verified_emails (user_id, email, verified_at, is_sign_in)
select id, lower(email), now(), true from auth.users where email is not null
on conflict do nothing;

-- Codes for adding another address: only the hash is kept, for 15 minutes, 5 tries.
create table private.email_codes (
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  primary key (user_id, email)
);

-- For the add-email Edge Function: a new 6-digit code for this person and address, returned
-- once so it can be emailed. The address is added unverified.
create function public.email_code_create(p_user_id uuid, p_email text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  address text := lower(btrim(p_email));
  random_bytes bytea := extensions.gen_random_bytes(4);
  -- From a secure random source, not random(): the code proves you own the address.
  code text := lpad(
    ((get_byte(random_bytes, 0)::bigint << 24 | get_byte(random_bytes, 1) << 16
      | get_byte(random_bytes, 2) << 8 | get_byte(random_bytes, 3)) % 1000000)::text,
    6, '0'
  );
begin
  if address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(address) > 254 then
    raise exception 'That doesn’t look like an email address' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.verified_emails
    where email = address and verified_at is not null and user_id <> p_user_id
  ) then
    raise exception 'That address belongs to another account' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.verified_emails
    where email = address and user_id = p_user_id and verified_at is not null
  ) then
    raise exception 'That address is already on your list' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.verified_emails (user_id, email) values (p_user_id, address)
  on conflict do nothing;
  insert into private.email_codes (user_id, email, code_hash, expires_at)
  values (p_user_id, address, encode(extensions.digest(code, 'sha256'), 'hex'), now() + interval '15 minutes')
  on conflict (user_id, email) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0;
  return code;
end;
$$;

-- You enter the code that was emailed to the address.
create function public.verify_email(p_email text, p_code text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pending private.email_codes;
begin
  select * into pending from private.email_codes
  where user_id = (select auth.uid()) and email = lower(btrim(p_email))
  for update;
  if not found or pending.expires_at < now() then
    raise exception 'That code has expired. Send a new one.' using errcode = 'invalid_parameter_value';
  end if;
  if pending.attempts >= 5 then
    raise exception 'Too many tries. Send a new code.' using errcode = 'invalid_parameter_value';
  end if;
  if pending.code_hash <> encode(extensions.digest(btrim(p_code), 'sha256'), 'hex') then
    update private.email_codes set attempts = attempts + 1
    where user_id = pending.user_id and email = pending.email;
    raise exception 'That code isn’t right' using errcode = 'invalid_parameter_value';
  end if;

  begin
    update public.verified_emails set verified_at = now()
    where user_id = pending.user_id and email = pending.email;
  exception when unique_violation then
    raise exception 'That address belongs to another account' using errcode = 'invalid_parameter_value';
  end;
  delete from private.email_codes where user_id = pending.user_id and email = pending.email;
end;
$$;

-- Removes one of your addresses (not the one you sign in with).
create function public.remove_email(p_email text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  delete from public.verified_emails
  where user_id = (select auth.uid()) and email = lower(btrim(p_email)) and not is_sign_in;
  if not found then
    raise exception 'You can’t remove that address' using errcode = 'invalid_parameter_value';
  end if;
  delete from private.email_codes
  where user_id = (select auth.uid()) and email = lower(btrim(p_email));
end;
$$;

-- Inbound email ---------------------------------------------------------------------------

alter table public.inbound_emails add column subject text;
alter table public.inbound_emails drop constraint inbound_emails_status_check;
alter table public.inbound_emails add constraint inbound_emails_status_check check (
  status in (
    'received', 'processing', 'drafted', 'duplicate', 'unknown_sender', 'forwarding_code',
    'failed'
  )
);

-- For postmark-inbound: whose verified address is first among these, if anyone's.
create function public.inbound_find_user(p_addresses text[])
returns uuid
language sql stable security definer set search_path = ''
as $$
  select v.user_id
  from unnest(p_addresses) with ordinality as a(address, ord)
  join public.verified_emails v on v.email = lower(btrim(a.address)) and v.verified_at is not null
  order by a.ord
  limit 1;
$$;

-- An email whose reading was cut off (the function ran out of time or memory) is marked failed
-- rather than left "processing" forever.
select cron.schedule(
  'fail-stuck-inbound-emails', '*/15 * * * *',
  $$update public.inbound_emails set status = 'failed', error = 'Timed out while reading'
    where status in ('received', 'processing') and received_at < now() - interval '15 minutes'$$
);

-- Drafts from forwarded receipts, under Needs you until split or dismissed.
create table public.receipt_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  inbound_email_id uuid references public.inbound_emails on delete set null,
  status text not null check (status in ('ok', 'mismatch')),
  receipt jsonb not null,
  gap_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  used_at timestamptz
);

create index receipt_drafts_open on public.receipt_drafts (user_id)
  where dismissed_at is null and used_at is null;

alter table public.receipt_drafts enable row level security;
grant select on public.receipt_drafts to authenticated;
create policy "Own receipt drafts" on public.receipt_drafts
  for select to authenticated using (user_id = (select auth.uid()));

-- Done with a draft: it was saved as an expense (used) or isn't a receipt (dismissed).
create function public.close_draft(p_draft_id uuid, p_used boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.receipt_drafts
  set used_at = case when p_used then now() end,
      dismissed_at = case when p_used then null else now() end
  where id = p_draft_id and user_id = (select auth.uid()) and used_at is null and dismissed_at is null;
  if not found then
    raise exception 'Draft not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- A forwarded receipt matching one already drafted or saved: same total and date (or both
-- without one), and the same store name.
create function public.inbound_is_duplicate(
  p_user_id uuid,
  p_merchant text,
  p_total_cents bigint,
  p_date date default null
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.receipt_drafts d
    where d.user_id = p_user_id and d.dismissed_at is null
      and (d.receipt->>'total_cents')::bigint = p_total_cents
      and (d.receipt->>'date') is not distinct from p_date::text
      and lower(coalesce(d.receipt->>'merchant', '')) = lower(coalesce(p_merchant, ''))
  ) or exists (
    select 1 from public.expenses e
    join public.participants p on p.id = e.paid_by
    where (e.created_by = p_user_id or p.user_id = p_user_id) and e.voided_at is null
      and e.total_cents = p_total_cents and e.expense_date is not distinct from p_date
      and lower(e.merchant) = lower(coalesce(p_merchant, ''))
  );
$$;

-- Gmail's "confirm forwarding" codes, shown to the person who asked to forward.
create table public.forwarding_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

alter table public.forwarding_codes enable row level security;
grant select on public.forwarding_codes to authenticated;
create policy "Own forwarding codes" on public.forwarding_codes
  for select to authenticated using (user_id = (select auth.uid()));

create function public.dismiss_forwarding_code(p_id uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.forwarding_codes set dismissed_at = now()
  where id = p_id and user_id = (select auth.uid());
$$;

-- Forwarded receipts count toward the same monthly limit as photos.
create or replace function public.receipt_scans_this_month(p_user_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(distinct storage_path)::integer
  from public.receipt_extractions
  where user_id = p_user_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    and status in ('succeeded', 'mismatch', 'unreadable');
$$;

-- Grants -----------------------------------------------------------------------------------

revoke execute on function
  public.email_code_create(uuid, text), public.verify_email(text, text), public.remove_email(text),
  public.inbound_find_user(text[]), public.close_draft(uuid, boolean),
  public.inbound_is_duplicate(uuid, text, bigint, date), public.dismiss_forwarding_code(uuid)
from public, anon, authenticated;

grant execute on function
  public.verify_email(text, text), public.remove_email(text), public.close_draft(uuid, boolean),
  public.dismiss_forwarding_code(uuid)
to authenticated;

-- Only Edge Functions call these.
grant execute on function
  public.email_code_create(uuid, text), public.inbound_find_user(text[]),
  public.inbound_is_duplicate(uuid, text, bigint, date)
to service_role;

revoke execute on all functions in schema private from public, anon;
