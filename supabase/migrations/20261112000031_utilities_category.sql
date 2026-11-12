-- Utilities is a default category: new accounts get it with the others, and every existing
-- account gets it now (unless it already has one by that name).

-- Otherwise as in 20261018000010.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  new_display_name text := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Me'
  ), 80);
  personal_group_id uuid;
begin
  insert into public.profiles (id, display_name, username)
    values (
      new.id,
      new_display_name,
      private.unique_username(coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), new_display_name))
    );

  insert into public.groups (name, created_by, is_personal)
    values ('Personal', new.id, true)
    returning id into personal_group_id;
  insert into public.participants (group_id, display_name, user_id)
    values (personal_group_id, new_display_name, new.id);

  insert into public.categories (user_id, name)
    select new.id, name
    from unnest(array['Rent', 'Utilities', 'Groceries', 'Dining', 'Transport', 'Fun', 'Other']) as name;

  return new;
end;
$$;

insert into public.categories (user_id, name)
select u.id, 'Utilities'
from auth.users u
where not exists (
  select 1 from public.categories c where c.user_id = u.id and lower(c.name) = 'utilities'
);
