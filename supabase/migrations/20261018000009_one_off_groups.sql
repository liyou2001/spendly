-- One-off groups: a group for a single outing, created inline from Add expense and kept out of
-- group lists. Otherwise an ordinary group, so balances, payments and privacy work unchanged.
alter table public.groups
  add column is_one_off boolean not null default false,
  add constraint groups_personal_or_one_off check (not (is_personal and is_one_off));

drop function public.create_group(text, jsonb);

-- p_people: [{ "display_name": text, "phone": "+16085551234" | null }]
-- A one-off needs at least one other person; a regular group can start with only its creator.
create function public.create_group(p_name text, p_people jsonb default '[]', p_one_off boolean default false)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_name text;
  new_group_id uuid;
begin
  if caller is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_people) is distinct from 'array' then
    raise exception 'People must be a list' using errcode = 'invalid_parameter_value';
  end if;
  if p_one_off and jsonb_array_length(p_people) = 0 then
    raise exception 'Add at least one person to split with' using errcode = 'invalid_parameter_value';
  end if;

  select display_name into caller_name from public.profiles where id = caller;

  insert into public.groups (name, created_by, is_one_off)
    values (btrim(p_name), caller, p_one_off)
    returning id into new_group_id;

  insert into public.participants (group_id, display_name, user_id)
    values (new_group_id, caller_name, caller);

  insert into public.participants (group_id, display_name, phone)
    select new_group_id, btrim(person.display_name), nullif(btrim(person.phone), '')
    from jsonb_to_recordset(p_people) as person(display_name text, phone text);

  return new_group_id;
end;
$$;

revoke execute on function public.create_group(text, jsonb, boolean) from public, anon;
grant execute on function public.create_group(text, jsonb, boolean) to authenticated;
