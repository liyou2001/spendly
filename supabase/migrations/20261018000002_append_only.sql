-- Rule 2: history is append-only. Expenses, items, assignments, shares and payments are never
-- updated or deleted. The only changes allowed are:
--   - voiding an expense (voided_at and voided_by set once);
--   - deciding a claimed payment (status claimed -> confirmed or rejected, with who and when).
--
-- Two layers enforce this:
--   1. The app's roles (anon, authenticated, service_role) have no UPDATE or DELETE grants
--      on ledger tables (see the privacy migration).
--   2. These triggers reject anything else, even from the table owner, so a bug in a
--      security definer function can't rewrite history either.

create schema if not exists private;

create function private.forbid_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
end;
$$;

create function private.guard_expense_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.voided_at is null
     and new.voided_at is not null
     and new.voided_by is not null
     and (to_jsonb(new) - 'voided_at' - 'voided_by') = (to_jsonb(old) - 'voided_at' - 'voided_by')
  then
    return new;
  end if;
  raise exception 'expenses is append-only: only voiding an unvoided expense is allowed'
    using errcode = 'restrict_violation';
end;
$$;

create function private.guard_payment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'claimed'
     and new.status in ('confirmed', 'rejected')
     and new.decided_by is not null
     and new.decided_at is not null
     and (to_jsonb(new) - 'status' - 'decided_by' - 'decided_at')
       = (to_jsonb(old) - 'status' - 'decided_by' - 'decided_at')
  then
    return new;
  end if;
  raise exception 'payments is append-only: only deciding a claimed payment is allowed'
    using errcode = 'restrict_violation';
end;
$$;

create trigger expenses_guard_update before update on public.expenses
  for each row execute function private.guard_expense_update();
create trigger payments_guard_update before update on public.payments
  for each row execute function private.guard_payment_update();

create trigger expense_items_no_update before update on public.expense_items
  for each row execute function private.forbid_ledger_change();
create trigger item_assignments_no_update before update on public.item_assignments
  for each row execute function private.forbid_ledger_change();
create trigger shares_no_update before update on public.shares
  for each row execute function private.forbid_ledger_change();

do $$
declare
  ledger_table text;
begin
  foreach ledger_table in array array['expenses', 'expense_items', 'item_assignments', 'shares', 'payments']
  loop
    execute format(
      'create trigger %1$s_no_delete before delete on public.%1$I
         for each row execute function private.forbid_ledger_change()',
      ledger_table
    );
    execute format(
      'create trigger %1$s_no_truncate before truncate on public.%1$I
         for each statement execute function private.forbid_ledger_change()',
      ledger_table
    );
  end loop;
end;
$$;

-- Rule 3: an expense's shares sum exactly to its total, and its items (when it has any) do too.
-- Checked at commit, after save_expense has inserted everything, so no insert path can skip it.
-- Runs on inserts into expenses, shares and expense_items, so rows added later are checked too.
create function private.check_expense_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  checked_id uuid;
  total bigint;
  share_sum bigint;
  item_sum bigint;
begin
  -- Separate branches: PL/pgSQL can't even look up new.expense_id on an expenses row.
  if tg_table_name = 'expenses' then
    checked_id := new.id;
  else
    checked_id := new.expense_id;
  end if;

  select total_cents into total from public.expenses where id = checked_id;
  select coalesce(sum(amount_cents), 0) into share_sum
    from public.shares where expense_id = checked_id;
  if share_sum <> total then
    raise exception 'Shares of expense % sum to % but its total is %', checked_id, share_sum, total
      using errcode = 'check_violation';
  end if;

  select sum(amount_cents) into item_sum
    from public.expense_items where expense_id = checked_id;
  if item_sum is not null and item_sum <> total then
    raise exception 'Items of expense % sum to % but its total is %', checked_id, item_sum, total
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger expenses_totals_match
  after insert on public.expenses
  deferrable initially deferred
  for each row execute function private.check_expense_totals();
create constraint trigger shares_totals_match
  after insert on public.shares
  deferrable initially deferred
  for each row execute function private.check_expense_totals();
create constraint trigger expense_items_totals_match
  after insert on public.expense_items
  deferrable initially deferred
  for each row execute function private.check_expense_totals();

-- A forgiveness belongs to an expense in the same group, and only that expense's payer
-- can forgive (they're the one owed).
create function private.check_forgiveness()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expense record;
begin
  if new.kind <> 'forgiveness' then
    return new;
  end if;
  select group_id, paid_by into expense from public.expenses where id = new.expense_id;
  if expense.group_id <> new.group_id or expense.paid_by <> new.to_participant then
    raise exception 'Only the payer of expense % can forgive debts on it', new.expense_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger payments_check_forgiveness before insert on public.payments
  for each row execute function private.check_forgiveness();
