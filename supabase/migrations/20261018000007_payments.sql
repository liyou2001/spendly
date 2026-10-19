-- Repayments, claims and forgiveness (Step 6). The app can't write payments directly; these
-- functions check who's asking and insert as the table owner. Balances and spending already
-- count confirmed payments and forgiveness (balances(), my_spending()).

-- The caller's participant in a group, or null if they're not in it.
create function private.my_participant_in(p_group_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.participants where group_id = p_group_id and user_id = (select auth.uid());
$$;

-- Records a repayment that counts immediately. Allowed for the person who got paid, or for the
-- payer when the person they paid has no account (and so can't confirm a claim).
create function public.record_payment(
  p_group_id uuid,
  p_from uuid,
  p_to uuid,
  p_amount_cents bigint,
  p_method text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := private.my_participant_in(p_group_id);
  recipient_user uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'You are not in this group' using errcode = 'insufficient_privilege';
  end if;
  select user_id into recipient_user from public.participants where id = p_to and group_id = p_group_id;
  if not found or not exists (select 1 from public.participants where id = p_from and group_id = p_group_id) then
    raise exception 'Both people must be in this group' using errcode = 'invalid_parameter_value';
  end if;
  if p_to <> me and not (p_from = me and recipient_user is null) then
    raise exception 'Only the person who got paid can record this. Use "I paid" so they can confirm.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.payments (
    group_id, from_participant, to_participant, amount_cents, kind, status, method,
    recorded_by, decided_by, decided_at
  )
  values (
    p_group_id, p_from, p_to, p_amount_cents, 'payment', 'confirmed', p_method,
    auth.uid(), auth.uid(), now()
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- "I paid": the caller says they paid someone who has the app. It doesn't count until they
-- confirm it with decide_payment.
create function public.claim_payment(
  p_group_id uuid,
  p_to uuid,
  p_amount_cents bigint,
  p_method text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := private.my_participant_in(p_group_id);
  recipient_user uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'You are not in this group' using errcode = 'insufficient_privilege';
  end if;
  select user_id into recipient_user from public.participants where id = p_to and group_id = p_group_id;
  if not found then
    raise exception 'They are not in this group' using errcode = 'invalid_parameter_value';
  end if;
  if recipient_user is null then
    raise exception 'They don’t have the app, so record the payment instead.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.payments (
    group_id, from_participant, to_participant, amount_cents, kind, status, method, recorded_by
  )
  values (p_group_id, me, p_to, p_amount_cents, 'payment', 'claimed', p_method, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

-- "Got it" (p_accept true) or "Didn't get it" on a claim made to the caller.
create function public.decide_payment(p_payment_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  claim public.payments;
begin
  select * into claim from public.payments
  where id = p_payment_id and status = 'claimed' and private.is_my_participant(to_participant)
  for update;
  if not found then
    raise exception 'Payment % not found, or already decided', p_payment_id using errcode = 'no_data_found';
  end if;

  update public.payments
    set status = case when p_accept then 'confirmed' else 'rejected' end,
        decided_by = auth.uid(),
        decided_at = now()
    where id = p_payment_id;
end;
$$;

-- Forgives up to what someone owes the caller in a group. Forgiveness belongs to an expense
-- (it becomes the caller's spending in that expense's category), so the amount is spread over
-- the expenses the caller paid that this person has a share of, newest first.
create function public.forgive_debt(p_group_id uuid, p_debtor uuid, p_amount_cents bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := private.my_participant_in(p_group_id);
  owed bigint;
  remaining bigint := p_amount_cents;
  expense record;
  portion bigint;
begin
  if me is null then
    raise exception 'You are not in this group' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'The amount must be more than zero' using errcode = 'invalid_parameter_value';
  end if;

  select amount_cents into owed from public.balances()
  where group_id = p_group_id and from_participant = p_debtor and to_participant = me;
  if coalesce(owed, 0) < p_amount_cents then
    raise exception 'You can forgive up to what they owe you (% cents)', coalesce(owed, 0)
      using errcode = 'invalid_parameter_value';
  end if;

  for expense in
    select e.id,
           s.amount_cents - coalesce((
             select sum(f.amount_cents) from public.payments f
             where f.expense_id = e.id and f.kind = 'forgiveness' and f.status = 'confirmed'
               and f.from_participant = p_debtor
           ), 0) as forgivable
    from public.expenses e
    join public.shares s on s.expense_id = e.id and s.participant_id = p_debtor
    where e.group_id = p_group_id and e.paid_by = me and e.voided_at is null
    order by e.expense_date desc, e.created_at desc, e.id
  loop
    exit when remaining = 0;
    portion := least(remaining, expense.forgivable);
    continue when portion <= 0;
    insert into public.payments (
      group_id, from_participant, to_participant, amount_cents, kind, expense_id, status,
      recorded_by, decided_by, decided_at
    )
    values (
      p_group_id, p_debtor, me, portion, 'forgiveness', expense.id, 'confirmed',
      auth.uid(), auth.uid(), now()
    );
    remaining := remaining - portion;
  end loop;

  -- Can't happen while what they owe comes from expenses the caller paid; checked anyway.
  if remaining > 0 then
    raise exception 'Not enough to forgive on your expenses' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

revoke execute on function
  private.my_participant_in(uuid),
  public.record_payment(uuid, uuid, uuid, bigint, text),
  public.claim_payment(uuid, uuid, bigint, text),
  public.decide_payment(uuid, boolean),
  public.forgive_debt(uuid, uuid, bigint)
  from public, anon;
grant execute on function
  public.record_payment(uuid, uuid, uuid, bigint, text),
  public.claim_payment(uuid, uuid, bigint, text),
  public.decide_payment(uuid, boolean),
  public.forgive_debt(uuid, uuid, bigint)
  to authenticated;
