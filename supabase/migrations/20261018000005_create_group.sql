-- Creating a group in one step: the group, the caller as its first participant, and any
-- name-only people, in one transaction, so a dropped connection can't leave a group with no
-- members (which nobody could then see or fix).
--
-- p_people: [{ "display_name": text, "phone": "+16085551234" | null }]
-- Returns the new group's id.
create function public.create_group(p_name text, p_people jsonb default '[]')
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

  select display_name into caller_name from public.profiles where id = caller;

  insert into public.groups (name, created_by)
    values (btrim(p_name), caller)
    returning id into new_group_id;

  insert into public.participants (group_id, display_name, user_id)
    values (new_group_id, caller_name, caller);

  insert into public.participants (group_id, display_name, phone)
    select new_group_id, btrim(person.display_name), nullif(btrim(person.phone), '')
    from jsonb_to_recordset(p_people) as person(display_name text, phone text);

  return new_group_id;
end;
$$;

revoke execute on function public.create_group(text, jsonb) from public, anon;
grant execute on function public.create_group(text, jsonb) to authenticated;
