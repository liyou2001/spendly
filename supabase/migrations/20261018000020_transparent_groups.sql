-- Transparent groups: everyone in a group sees every expense in it in full (items, who each
-- was for, the total and every share), and the payment page shows the full bill. People outside
-- a group still see nothing of it. Editing and voiding stay with whoever paid or entered it.

create or replace function private.can_see_expense(p_expense_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id
      and (private.is_group_member(e.group_id) or e.created_by = (select auth.uid()))
  );
$$;

-- Your spending rows now carry every expense's total, not only ones you paid or entered.
create or replace function private.my_spending_rows()
returns table (
  item_id uuid,
  expense_id uuid,
  group_id uuid,
  merchant text,
  expense_date date,
  category_id uuid,
  amount_cents bigint,
  total_cents bigint,
  paid_by_name text,
  you_paid boolean,
  is_forgiveness boolean
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select id from public.participants where user_id = (select auth.uid())
  )
  select e.id, e.id, e.group_id, e.merchant, e.expense_date,
         private.my_category(e.id, s.participant_id, e.paid_by, e.category_id, s.category_override_id),
         s.amount_cents,
         e.total_cents,
         payer.display_name,
         s.participant_id = e.paid_by,
         false
  from public.expenses e
  join public.shares s on s.expense_id = e.id
  join public.participants payer on payer.id = e.paid_by
  where e.voided_at is null and s.participant_id in (select id from mine) and s.amount_cents > 0
  union all
  select p.id, e.id, e.group_id, e.merchant, e.expense_date, e.category_id, p.amount_cents,
         e.total_cents, payer.display_name, true, true
  from public.payments p
  join public.expenses e on e.id = p.expense_id
  join public.participants payer on payer.id = e.paid_by
  where p.kind = 'forgiveness' and p.status = 'confirmed' and e.voided_at is null
    and p.to_participant in (select id from mine);
$$;

-- The payment page's expenses, in full.
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

  -- Newest first, until they cover what's owed. Each listed in full: every item, who it was
  -- for, the total and everyone's shares. People are labelled p001, p002… in the same order as
  -- their ids, so the page's breakdown rounds exactly like the saved shares (Rule 3).
  with mine as (
    select
      e.id,
      e.merchant,
      e.expense_date,
      e.created_at,
      e.total_cents,
      s.amount_cents,
      coalesce(sum(s.amount_cents) over (
        order by e.expense_date desc, e.created_at desc, e.id
        rows between unbounded preceding and 1 preceding
      ), 0) as before
    from public.expenses e
    join public.shares s on s.expense_id = e.id and s.participant_id = them.id
    where e.paid_by = payer.id and e.voided_at is null and s.amount_cents > 0
  ),
  refs as (
    select
      s.expense_id,
      s.participant_id,
      'p' || lpad(
        (row_number() over (partition by s.expense_id order by s.participant_id::text))::text, 3, '0'
      ) as ref
    from public.shares s
    where s.expense_id in (select id from mine)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'merchant', m.merchant,
          'expense_date', m.expense_date,
          'total_cents', m.total_cents,
          'amount_cents', m.amount_cents,
          'people', (
            select jsonb_agg(
              jsonb_build_object('ref', r.ref, 'name', p.display_name, 'you', r.participant_id = them.id)
              order by r.ref
            )
            from refs r join public.participants p on p.id = r.participant_id
            where r.expense_id = m.id
          ),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name', i.name,
                'amount_cents', i.amount_cents,
                'kind', i.kind,
                'quantity', i.quantity,
                'by_units', i.by_units,
                'people', coalesce((
                  select jsonb_agg(jsonb_build_object('ref', r.ref, 'units', a.units) order by r.ref)
                  from public.item_assignments a
                  join refs r on r.expense_id = m.id and r.participant_id = a.participant_id
                  where a.item_id = i.id
                ), '[]'::jsonb)
              )
              order by i.position
            )
            from public.expense_items i
            where i.expense_id = m.id
          ), '[]'::jsonb),
          'shares', (
            select jsonb_agg(jsonb_build_object('ref', r.ref, 'amount_cents', s.amount_cents) order by r.ref)
            from public.shares s
            join refs r on r.expense_id = s.expense_id and r.participant_id = s.participant_id
            where s.expense_id = m.id
          )
        )
        order by m.expense_date desc, m.created_at desc
      ) filter (where m.before < owed),
      '[]'::jsonb
    ),
    count(*) filter (where m.before >= owed)
  into shown, earlier
  from mine m;

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
