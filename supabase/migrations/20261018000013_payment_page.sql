-- Step 8: private payment links for people without the app, problem reports, push tokens and
-- auto-confirming claims.
--
-- The payment page never talks to the database directly. It calls Edge Functions, which call
-- the link_* functions below with the service role. Those functions take the hash of the link's
-- token (the token itself is never stored) and return only what the page may show.

create extension if not exists pg_cron with schema pg_catalog;

-- Links ------------------------------------------------------------------------------

-- Who asked to be paid: links are per pair, "Leo's link for Jeff".
alter table public.share_links
  add column requested_by uuid not null references public.participants;

create index share_links_pair on public.share_links (participant_id, requested_by)
  where revoked_at is null;

-- What `debtor` owes `creditor` in a group, net of what the creditor owes back and of
-- confirmed payments between them. Negative when the creditor owes the debtor.
create function private.pair_owed(p_group_id uuid, p_debtor uuid, p_creditor uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(amount), 0)::bigint
  from (
    select case when s.participant_id = p_debtor then s.amount_cents else -s.amount_cents end
    from public.expenses e
    join public.shares s on s.expense_id = e.id
    where e.group_id = p_group_id and e.voided_at is null
      and ((e.paid_by = p_creditor and s.participant_id = p_debtor)
        or (e.paid_by = p_debtor and s.participant_id = p_creditor))
    union all
    select case when p.from_participant = p_debtor then -p.amount_cents else p.amount_cents end
    from public.payments p
    left join public.expenses forgiven on forgiven.id = p.expense_id
    where p.group_id = p_group_id and p.status = 'confirmed' and forgiven.voided_at is null
      and ((p.from_participant = p_debtor and p.to_participant = p_creditor)
        or (p.from_participant = p_creditor and p.to_participant = p_debtor))
  ) owed (amount);
$$;

-- A new private link for someone in one of your groups, so they can see what they owe you.
-- Returns the token once; only its hash is kept. Older links keep working until revoked.
create function public.create_share_link(p_participant_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  them public.participants;
  me uuid;
  token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
begin
  select * into them from public.participants where id = p_participant_id;
  me := private.my_participant_in(them.group_id);
  if them.id is null or me is null then
    raise exception 'Person not found' using errcode = 'no_data_found';
  end if;
  if them.id = me then
    raise exception 'You can’t request a payment from yourself' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.share_links (participant_id, requested_by, token_hash)
  values (them.id, me, encode(extensions.digest(token, 'sha256'), 'hex'));
  return token;
end;
$$;

-- Stops every link you made for this person. Returns how many were active.
create function public.revoke_share_links(p_participant_id uuid)
returns integer
language sql volatile security definer set search_path = ''
as $$
  with revoked as (
    update public.share_links l set revoked_at = now()
    from public.participants them
    where l.participant_id = p_participant_id and them.id = l.participant_id
      and l.requested_by = private.my_participant_in(them.group_id)
      and l.revoked_at is null
    returning l.id
  )
  select count(*)::integer from revoked;
$$;

-- How many working links you've made for this person.
create function public.active_share_links(p_participant_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.share_links l
  join public.participants them on them.id = l.participant_id
  where l.participant_id = p_participant_id
    and l.requested_by = private.my_participant_in(them.group_id)
    and l.revoked_at is null;
$$;

-- The active link with this token hash, or an error the page shows as "This link doesn't work".
create function private.active_link(p_token_hash text)
returns public.share_links
language plpgsql stable security definer set search_path = ''
as $$
declare
  link public.share_links;
begin
  select * into link from public.share_links where token_hash = p_token_hash and revoked_at is null;
  if not found then
    raise exception 'This link doesn’t work anymore' using errcode = 'no_data_found';
  end if;
  return link;
end;
$$;

-- Everything the payment page shows, and nothing else: the person's own items and shares on
-- expenses the requester paid, what they owe, and the requester's payment usernames. Never an
-- expense's total, the requester's own items, or anyone else's items (Rule 5).
create function public.link_share(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  link public.share_links := private.active_link(p_token_hash);
  them public.participants;
  payer public.participants;
  handles public.profiles;
begin
  select * into them from public.participants where id = link.participant_id;
  select * into payer from public.participants where id = link.requested_by;
  select * into handles from public.profiles where id = payer.user_id;

  return jsonb_build_object(
    'person_name', them.display_name,
    'payer_name', payer.display_name,
    'group_name', (select name from public.groups where id = them.group_id),
    'owed_cents', private.pair_owed(them.group_id, them.id, payer.id),
    'pending_cents', (
      select coalesce(sum(amount_cents), 0) from public.payments
      where from_participant = them.id and to_participant = payer.id and status = 'claimed'
    ),
    'handles', jsonb_build_object(
      'venmo', handles.venmo_username,
      'paypal', handles.paypal_username,
      'cashtag', handles.cashapp_tag
    ),
    'texts_opted_in', exists (
      select 1 from public.sms_consents where participant_id = them.id and revoked_at is null
    ),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'merchant', e.merchant,
          'expense_date', e.expense_date,
          'amount_cents', s.amount_cents,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name', i.name,
                'amount_cents', i.amount_cents,
                'split_count', (select count(*) from public.item_assignments a2 where a2.item_id = i.id)
              )
              order by i.position
            )
            from public.expense_items i
            join public.item_assignments a on a.item_id = i.id
            where i.expense_id = e.id and a.participant_id = them.id
          ), '[]'::jsonb)
        )
        order by e.expense_date desc, e.created_at desc
      )
      from public.expenses e
      join public.shares s on s.expense_id = e.id and s.participant_id = them.id
      where e.paid_by = payer.id and e.voided_at is null and s.amount_cents > 0
    ), '[]'::jsonb)
  );
end;
$$;

-- "I paid Leo" from the page: a claim the payer confirms in the app. At most what's still
-- owed after claims waiting to be confirmed.
create function public.link_claim(p_token_hash text, p_amount_cents bigint, p_method text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  link public.share_links := private.active_link(p_token_hash);
  them public.participants;
  payer public.participants;
  pending bigint;
  owed bigint;
  new_id uuid;
begin
  select * into them from public.participants where id = link.participant_id;
  select * into payer from public.participants where id = link.requested_by;
  select coalesce(sum(amount_cents), 0)
    into pending
    from public.payments
    where from_participant = them.id and to_participant = payer.id and status = 'claimed';
  owed := private.pair_owed(them.group_id, them.id, payer.id) - pending;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter how much you paid' using errcode = 'invalid_parameter_value';
  end if;
  if p_amount_cents > owed then
    raise exception 'That’s more than you owe (%)', to_char(owed / 100.0, 'FM$999,990.00')
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.payments (
    group_id, from_participant, to_participant, amount_cents, kind, status, method
  )
  values (them.group_id, them.id, payer.id, p_amount_cents, 'payment', 'claimed', p_method)
  returning id into new_id;

  return jsonb_build_object(
    'payment_id', new_id,
    'notify_user_id', payer.user_id,
    'person_name', them.display_name,
    'person_id', them.id
  );
end;
$$;

-- "Something looks wrong": a note to the payer, shown in their app until they dismiss it.
create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups,
  from_participant uuid not null,
  to_participant uuid not null,
  message text not null check (length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (from_participant, group_id) references public.participants (id, group_id),
  foreign key (to_participant, group_id) references public.participants (id, group_id)
);

create index problem_reports_to on public.problem_reports (to_participant) where resolved_at is null;

alter table public.problem_reports enable row level security;
grant select on public.problem_reports to authenticated;
create policy "Reports sent to you" on public.problem_reports
  for select to authenticated using (private.is_my_participant(to_participant));

create function public.link_flag(p_token_hash text, p_message text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  link public.share_links := private.active_link(p_token_hash);
  them public.participants;
  payer public.participants;
begin
  select * into them from public.participants where id = link.participant_id;
  select * into payer from public.participants where id = link.requested_by;
  if (select count(*) from public.problem_reports
      where from_participant = them.id and to_participant = payer.id and resolved_at is null) >= 3 then
    raise exception '% hasn’t read your earlier notes yet', payer.display_name
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.problem_reports (group_id, from_participant, to_participant, message)
  values (them.group_id, them.id, payer.id, btrim(p_message));

  return jsonb_build_object(
    'notify_user_id', payer.user_id,
    'person_name', them.display_name,
    'person_id', them.id
  );
end;
$$;

-- Dismisses a note sent to you.
create function public.resolve_problem(p_report_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.problem_reports set resolved_at = now()
  where id = p_report_id and resolved_at is null and private.is_my_participant(to_participant);
  if not found then
    raise exception 'Note not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- The text opt-in on the page. The number is typed by the person themselves (Rule 8).
create function public.link_text_opt_in(p_token_hash text, p_phone text, p_opt_in boolean)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  link public.share_links := private.active_link(p_token_hash);
begin
  if p_opt_in then
    if p_phone is null then
      raise exception 'Enter your phone number' using errcode = 'invalid_parameter_value';
    end if;
    update public.sms_consents set revoked_at = now()
    where participant_id = link.participant_id and revoked_at is null and phone <> p_phone;
    insert into public.sms_consents (phone, participant_id, source)
    select p_phone, link.participant_id, 'payment_page'
    where not exists (
      select 1 from public.sms_consents
      where participant_id = link.participant_id and phone = p_phone and revoked_at is null
    );
  else
    update public.sms_consents set revoked_at = now()
    where participant_id = link.participant_id and revoked_at is null;
  end if;
  return p_opt_in;
end;
$$;

-- Rate limits ------------------------------------------------------------------------

create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (key, window_start)
);

-- Counts a hit against `key` and says whether it's allowed: at most p_max per window.
create function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql volatile security definer set search_path = ''
as $$
  insert into private.rate_limits (key, window_start, hits)
  values (
    p_key,
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds),
    1
  )
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits <= p_max;
$$;

-- Push -------------------------------------------------------------------------------

-- Saves this phone's push token for you, moving it from another account signed in before.
create function public.register_push_token(p_token text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Not an Expo push token' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.push_tokens (token, user_id) values (p_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, created_at = now();
end;
$$;

create function public.push_tokens_for(p_user_id uuid)
returns setof text
language sql stable security definer set search_path = ''
as $$
  select token from public.push_tokens where user_id = p_user_id;
$$;

-- For an "I paid" made in the app: who to notify, if the caller made this claim just now.
create function public.claim_notice(p_payment_id uuid, p_user_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'notify_user_id', recipient.user_id,
    'person_name', claimer.display_name,
    'person_id', claimer.id,
    'amount_cents', p.amount_cents
  )
  from public.payments p
  join public.participants claimer on claimer.id = p.from_participant
  join public.participants recipient on recipient.id = p.to_participant
  where p.id = p_payment_id and p.status = 'claimed' and p.recorded_by = p_user_id
    and p.created_at > now() - interval '10 minutes';
$$;

-- Auto-confirming claims -------------------------------------------------------------

-- Off (null) by default. When set, claims to you confirm themselves after this many days.
alter table public.profiles
  add column auto_confirm_days smallint check (auto_confirm_days between 1 and 30);

grant update (auto_confirm_days) on public.profiles to authenticated;

create function private.auto_confirm_claims()
returns integer
language sql volatile security definer set search_path = ''
as $$
  with due as (
    select p.id, recipient.user_id
    from public.payments p
    join public.participants recipient on recipient.id = p.to_participant
    join public.profiles prof on prof.id = recipient.user_id
    where p.status = 'claimed' and prof.auto_confirm_days is not null
      and p.created_at < now() - make_interval(days => prof.auto_confirm_days)
  ),
  confirmed as (
    update public.payments p
    set status = 'confirmed', decided_by = due.user_id, decided_at = now()
    from due where p.id = due.id
    returning p.id
  )
  select count(*)::integer from confirmed;
$$;

select cron.schedule('auto-confirm-claims', '7 * * * *', 'select private.auto_confirm_claims()');
select cron.schedule(
  'clear-rate-limits', '37 3 * * *',
  $$delete from private.rate_limits where window_start < now() - interval '1 day'$$
);

-- Grants -----------------------------------------------------------------------------

revoke execute on function
  public.create_share_link(uuid), public.revoke_share_links(uuid), public.active_share_links(uuid),
  public.resolve_problem(uuid), public.register_push_token(text),
  public.link_share(text), public.link_claim(text, bigint, text), public.link_flag(text, text),
  public.link_text_opt_in(text, text, boolean), public.hit_rate_limit(text, integer, integer),
  public.push_tokens_for(uuid), public.claim_notice(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.create_share_link(uuid), public.revoke_share_links(uuid), public.active_share_links(uuid),
  public.resolve_problem(uuid), public.register_push_token(text)
to authenticated;

-- Only Edge Functions call these.
grant execute on function
  public.link_share(text), public.link_claim(text, bigint, text), public.link_flag(text, text),
  public.link_text_opt_in(text, text, boolean), public.hit_rate_limit(text, integer, integer),
  public.push_tokens_for(uuid), public.claim_notice(uuid, uuid)
to service_role;

revoke execute on all functions in schema private from public, anon;
