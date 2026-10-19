-- Fixes from reviewing Step 8:
-- 1. The payment page lists only the expenses behind what's owed now (newest first, until they
--    cover it), with a count of older ones, instead of every expense ever.
-- 2. Two claims from the same page at once can't both pass the "no more than you owe" check.

create or replace function public.link_share(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  link public.share_links := private.active_link(p_token_hash);
  them public.participants;
  payer public.participants;
  handles public.profiles;
  owed bigint;
  shown jsonb;
  earlier integer;
begin
  select * into them from public.participants where id = link.participant_id;
  select * into payer from public.participants where id = link.requested_by;
  select * into handles from public.profiles where id = payer.user_id;
  owed := private.pair_owed(them.group_id, them.id, payer.id);

  -- Newest first, until they cover what's owed. Older ones were paid off already.
  with mine as (
    select
      e.merchant,
      e.expense_date,
      e.created_at,
      s.amount_cents,
      coalesce((
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
      ), '[]'::jsonb) as items,
      coalesce(sum(s.amount_cents) over (
        order by e.expense_date desc, e.created_at desc, e.id
        rows between unbounded preceding and 1 preceding
      ), 0) as before
    from public.expenses e
    join public.shares s on s.expense_id = e.id and s.participant_id = them.id
    where e.paid_by = payer.id and e.voided_at is null and s.amount_cents > 0
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'merchant', merchant,
          'expense_date', expense_date,
          'amount_cents', amount_cents,
          'items', items
        )
        order by expense_date desc, created_at desc
      ) filter (where before < owed),
      '[]'::jsonb
    ),
    count(*) filter (where before >= owed)
  into shown, earlier
  from mine;

  return jsonb_build_object(
    'person_name', them.display_name,
    'payer_name', payer.display_name,
    'group_name', (select name from public.groups where id = them.group_id),
    'owed_cents', owed,
    'pending_cents', (
      select coalesce(sum(amount_cents), 0) from public.payments
      where from_participant = them.id and to_participant = payer.id and status = 'claimed'
    ),
    'handles', jsonb_build_object(
      'venmo', handles.venmo_username,
      'paypal', handles.paypal_username,
      'cashtag', handles.cashapp_tag,
      'zelle', handles.zelle_contact
    ),
    'texts_opted_in', exists (
      select 1 from public.sms_consents where participant_id = them.id and revoked_at is null
    ),
    'expenses', shown,
    'earlier_count', earlier
  );
end;
$$;

create or replace function public.link_claim(p_token_hash text, p_amount_cents bigint, p_method text default null)
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
  -- One claim at a time per person, so two at once can't both pass the check below.
  select * into them from public.participants where id = link.participant_id for update;
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
