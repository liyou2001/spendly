-- Zelle as a way to get paid. Zelle has no payment links, so the page and the app show the
-- email or US phone number to send to, which the person paid chose to share.

alter table public.profiles
  add column zelle_contact text check (
    zelle_contact ~ '^\+1[0-9]{10}$'
    or (zelle_contact = lower(zelle_contact) and length(zelle_contact) <= 254
        and zelle_contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  );

grant update (zelle_contact) on public.profiles to authenticated;

alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('venmo', 'paypal', 'cashapp', 'zelle', 'cash', 'other'));

-- The payment page also gets the requester's Zelle email or phone, if they added one.
create or replace function public.link_share(p_token_hash text)
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
      'cashtag', handles.cashapp_tag,
      'zelle', handles.zelle_contact
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
