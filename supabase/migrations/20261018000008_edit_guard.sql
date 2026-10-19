-- Editing an expense saves a replacement and voids the original (save_expense with
-- p_replaces_expense_id). Forgiveness belongs to the original expense, so it would silently
-- stop counting. Until forgiveness can be carried over, such expenses can't be edited.
create function private.check_replacement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.replaces_expense_id is not null and exists (
    select 1 from public.payments
    where expense_id = new.replaces_expense_id and kind = 'forgiveness' and status = 'confirmed'
  ) then
    raise exception 'A debt on this expense was forgiven, so it can’t be edited. Void it and add it again instead.'
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger expenses_check_replacement before insert on public.expenses
  for each row execute function private.check_replacement();
