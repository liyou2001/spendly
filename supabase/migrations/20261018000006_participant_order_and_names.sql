-- 1. Participants keep the order they were added in.
--    now() is the same for every row in a transaction, so create_group (the creator plus
--    everyone else in one go) gave the whole group one timestamp and the order was arbitrary.
--    clock_timestamp() advances row by row, so rows inserted together keep their order.
alter table public.participants alter column created_at set default clock_timestamp();

-- 2. Your display name in groups follows your profile.
--    Groups show participants.display_name, copied from the profile when you joined. Renaming
--    yourself (Me → Profile & payments) now updates every group you're in.
create function private.sync_participant_names()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.participants
    set display_name = new.display_name
    where user_id = new.id and display_name is distinct from new.display_name;
  return new;
end;
$$;

create trigger profiles_sync_participant_names
  after update of display_name on public.profiles
  for each row
  when (old.display_name is distinct from new.display_name)
  execute function private.sync_participant_names();

revoke execute on function private.sync_participant_names() from public, anon;
