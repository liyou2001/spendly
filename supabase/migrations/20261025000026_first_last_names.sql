-- First and last names, asked for when someone first signs in. The name people see
-- (display_name: in groups, payment requests and on the payment page) is "First Last", built by
-- set_my_name(), so it's never the start of an email address. Accounts made before this have no
-- names yet and are asked the next time they open the app.

alter table public.profiles
  add column first_name text check (length(btrim(first_name)) between 1 and 40),
  add column last_name text check (length(btrim(last_name)) between 1 and 40),
  -- Both or neither: half a name isn't a name.
  add constraint profiles_names_together check ((first_name is null) = (last_name is null));

-- Names change only through set_my_name(), which keeps display_name in step with them.
revoke update (display_name) on public.profiles from authenticated;

create function public.set_my_name(p_first_name text, p_last_name text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  first text := btrim(coalesce(p_first_name, ''));
  last text := btrim(coalesce(p_last_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'invalid_parameter_value';
  end if;
  if length(first) = 0 then
    raise exception 'Enter your first name.' using errcode = 'invalid_parameter_value';
  end if;
  if length(last) = 0 then
    raise exception 'Enter your last name.' using errcode = 'invalid_parameter_value';
  end if;
  if length(first) > 40 or length(last) > 40 then
    raise exception 'Keep each name to 40 characters or fewer.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- display_name in the SET list, so the trigger that renames you in your groups runs.
  update public.profiles
  set first_name = first, last_name = last, display_name = left(first || ' ' || last, 80)
  where id = auth.uid();
end;
$$;

revoke execute on function public.set_my_name(text, text) from public, anon;
grant execute on function public.set_my_name(text, text) to authenticated;
