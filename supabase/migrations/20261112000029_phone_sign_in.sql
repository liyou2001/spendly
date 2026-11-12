-- Signing in with a phone number. Such an account has no email, so the signup trigger can only
-- seed its username from the placeholder name ("Me"). The first time it saves a name, it gets a
-- username from that name instead ("Tess Lee" → "tesslee"); accounts with an email keep the one
-- from their email. Otherwise as in 20261025000026.

create or replace function public.set_my_name(p_first_name text, p_last_name text)
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
  update public.profiles p
  set first_name = first,
      last_name = last,
      display_name = left(first || ' ' || last, 80),
      username = case
        when p.first_name is null
          and (select u.email from auth.users u where u.id = p.id) is null
        then private.unique_username(first || last)
        else p.username
      end
  where p.id = auth.uid();
end;
$$;
