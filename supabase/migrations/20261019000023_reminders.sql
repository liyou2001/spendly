-- Step 11: reminders for debts left unpaid, and texts through sendText().
--
-- Every hour, pg_cron asks the send-reminders Edge Function to remind about debts unpaid for
-- more than 3 days: a push to someone with the app, a text to someone who opted in on their
-- payment link, or otherwise a push to the person owed, to remind them from their own phone.
-- At most one reminder per debt every 3 days, and only between 9am and 9pm for the person owed.

create extension if not exists pg_net with schema extensions;

-- Your phone's time zone, so reminders don't arrive at night. Saved by the app.
alter table public.profiles add column time_zone text;

create function public.set_time_zone(p_time_zone text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Unknown time zone' using errcode = 'invalid_parameter_value';
  end if;
  update public.profiles set time_zone = p_time_zone where id = auth.uid();
end;
$$;

-- Each reminder sent, so a debt is reminded about at most once every 3 days.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups,
  debtor_id uuid not null,
  creditor_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  channel text not null check (channel in ('push', 'text', 'nudge')),
  outbound_message_id uuid references public.outbound_messages,
  created_at timestamptz not null default now(),
  foreign key (debtor_id, group_id) references public.participants (id, group_id),
  foreign key (creditor_id, group_id) references public.participants (id, group_id)
);

create index reminders_pair on public.reminders (group_id, debtor_id, creditor_id, created_at desc);

-- Edge Functions only.
alter table public.reminders enable row level security;
revoke all on public.reminders from anon, authenticated;

-- Whether it's between 9am and 9pm in a time zone. Without one, it has to be daytime in both
-- New York and Los Angeles.
create function private.is_daytime(p_time_zone text, p_at timestamptz)
returns boolean
language sql stable set search_path = ''
as $$
  select bool_and(extract(hour from p_at at time zone zone) between 9 and 20)
  from unnest(
    case when p_time_zone is null then array['America/New_York', 'America/Los_Angeles']
    else array[p_time_zone] end
  ) as zones (zone);
$$;

-- Debts to remind about now: unpaid for more than 3 days, owed to someone with an account, not
-- reminded about in the last 3 days, with no "I paid" waiting to be confirmed, and in the day
-- for the person owed. How old a debt is goes by the oldest expense still unpaid, counting
-- payments against the oldest expenses first. The channel is a push to the debtor if they have
-- the app on a phone, a text if they opted in, or else a nudge to the person owed.
create function public.due_reminders(p_now timestamptz default now())
returns table (
  group_id uuid,
  group_name text,
  debtor_id uuid,
  debtor_name text,
  debtor_user_id uuid,
  creditor_id uuid,
  creditor_name text,
  creditor_user_id uuid,
  time_zone text,
  amount_cents bigint,
  oldest_unpaid_at timestamptz,
  channel text,
  phone text
)
language sql stable security definer set search_path = ''
as $$
  with pairs as (
    select distinct e.group_id, s.participant_id as debtor_id, e.paid_by as creditor_id
    from public.expenses e
    join public.shares s on s.expense_id = e.id
    where e.voided_at is null and s.participant_id <> e.paid_by and s.amount_cents > 0
  ),
  owed as (
    select p.*, private.pair_owed(p.group_id, p.debtor_id, p.creditor_id) as amount_cents
    from pairs p
  ),
  charges as (
    select o.group_id, o.debtor_id, o.creditor_id, o.amount_cents as owed_cents, e.created_at,
      coalesce(sum(s.amount_cents) over (
        partition by o.group_id, o.debtor_id, o.creditor_id
        order by e.created_at desc, e.id desc
        rows between unbounded preceding and 1 preceding
      ), 0) as newer_cents
    from owed o
    join public.expenses e
      on e.group_id = o.group_id and e.paid_by = o.creditor_id and e.voided_at is null
    join public.shares s on s.expense_id = e.id and s.participant_id = o.debtor_id
    where o.amount_cents > 0
  ),
  debts as (
    select c.group_id, c.debtor_id, c.creditor_id, c.owed_cents as amount_cents,
      min(c.created_at) as oldest_unpaid_at
    from charges c
    where c.newer_cents < c.owed_cents
    group by c.group_id, c.debtor_id, c.creditor_id, c.owed_cents
  )
  select d.group_id, g.name, d.debtor_id, debtor.display_name, debtor.user_id,
    d.creditor_id, creditor.display_name, creditor.user_id, profile.time_zone,
    d.amount_cents, d.oldest_unpaid_at,
    case
      when debtor_has_app then 'push'
      when consent.phone is not null then 'text'
      else 'nudge'
    end,
    case when not debtor_has_app then consent.phone end
  from debts d
  join public.groups g on g.id = d.group_id
  join public.participants debtor on debtor.id = d.debtor_id
  join public.participants creditor on creditor.id = d.creditor_id
  join public.profiles profile on profile.id = creditor.user_id
  cross join lateral (
    select exists (
      select 1 from public.push_tokens t where t.user_id = debtor.user_id
    ) as debtor_has_app
  ) app
  left join lateral (
    select c.phone from public.sms_consents c
    where c.participant_id = d.debtor_id and c.revoked_at is null
    order by c.consented_at desc
    limit 1
  ) consent on true
  where d.oldest_unpaid_at < p_now - interval '3 days'
    and private.is_daytime(profile.time_zone, p_now)
    and not exists (
      select 1 from public.reminders r
      where r.group_id = d.group_id and r.debtor_id = d.debtor_id
        and r.creditor_id = d.creditor_id and r.created_at > p_now - interval '3 days'
    )
    and not exists (
      select 1 from public.payments p
      where p.group_id = d.group_id and p.from_participant = d.debtor_id
        and p.to_participant = d.creditor_id and p.status = 'claimed'
    )
    -- A nudge needs the person owed to have the app.
    and (debtor_has_app or consent.phone is not null
      or exists (select 1 from public.push_tokens t where t.user_id = creditor.user_id))
  order by d.oldest_unpaid_at;
$$;

-- Hourly: ask send-reminders to send what's due. It needs two Vault secrets, set once per
-- database (README, "Reminders and texts"): project_url and cron_secret. Without them, nothing
-- is sent.
create function private.request_reminders()
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
    url := rtrim(url, '/') || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

select cron.schedule('send-reminders', '17 * * * *', 'select private.request_reminders()');

-- Grants -----------------------------------------------------------------------------

revoke execute on function public.set_time_zone(text), public.due_reminders(timestamptz)
from public, anon, authenticated;
grant execute on function public.set_time_zone(text) to authenticated;
-- Only Edge Functions call this.
grant execute on function public.due_reminders(timestamptz) to service_role;

revoke execute on all functions in schema private from public, anon;
