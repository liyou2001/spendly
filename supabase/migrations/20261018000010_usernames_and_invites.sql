-- Usernames and in-app invites: find someone by their Spendly username, invite them to be a
-- person in your group, and once they accept, the group's expenses show in their account.

-- Usernames -----------------------------------------------------------------

alter table public.profiles add column username text;

-- A free username built from a seed (the email name at sign-up): lowercase letters, numbers,
-- "_" and ".", 3–20 characters, with a number added if it's taken.
create function private.unique_username(p_seed text)
returns text
language plpgsql set search_path = ''
as $$
declare
  base text := left(regexp_replace(lower(coalesce(p_seed, '')), '[^a-z0-9_.]', '', 'g'), 16);
  candidate text;
  n integer := 0;
begin
  if length(base) < 3 then
    base := left(base || 'user', 16);
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    n := n + 1;
    candidate := left(base, 20 - length(n::text)) || n::text;
  end loop;
  return candidate;
end;
$$;

-- Existing accounts get one, oldest first.
do $$
declare
  profile record;
begin
  for profile in
    select p.id, u.email, p.display_name
    from public.profiles p join auth.users u on u.id = p.id
    order by u.created_at
  loop
    update public.profiles
      set username = private.unique_username(coalesce(nullif(split_part(profile.email, '@', 1), ''), profile.display_name))
      where id = profile.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,20}$');
create unique index profiles_username_unique on public.profiles (lower(username));

grant update (username) on public.profiles to authenticated;

-- New accounts get a username at sign-up too.
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
    from unnest(array['Rent', 'Groceries', 'Dining', 'Transport', 'Fun', 'Other']) as name;

  return new;
end;
$$;

-- "@Jeff_K", " jeff_k " → "jeff_k".
create function private.normalize_username(p_username text)
returns text
language sql immutable set search_path = ''
as $$
  select lower(ltrim(btrim(coalesce(p_username, '')), '@'));
$$;

-- Exact match only, so nobody can browse or scrape a list of users. Never returns yourself.
create function public.find_user(p_username text)
returns table (user_id uuid, display_name text, username text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.username
  from public.profiles p
  where auth.uid() is not null
    and lower(p.username) = private.normalize_username(p_username)
    and p.id <> auth.uid();
$$;

-- Whether a username is free for the caller. Their own current username counts as free.
create function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and not exists (
    select 1 from public.profiles p
    where lower(p.username) = private.normalize_username(p_username) and p.id <> auth.uid()
  );
$$;

-- Invites -------------------------------------------------------------------

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  -- The person in the group the invitee becomes.
  participant_id uuid not null references public.participants,
  invited_user_id uuid not null references auth.users on delete cascade,
  invited_by uuid not null references auth.users,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null))
);

create unique index group_invites_one_pending on public.group_invites (participant_id)
  where status = 'pending';
create index group_invites_invited_user on public.group_invites (invited_user_id)
  where status = 'pending';

alter table public.group_invites enable row level security;
grant select on public.group_invites to authenticated;

-- The inviter, the invitee, and members of the group (who see that someone's been invited).
create function private.can_see_invite(p_participant_id uuid, p_invited_user_id uuid, p_invited_by uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_invited_by = (select auth.uid())
      or p_invited_user_id = (select auth.uid())
      or private.is_group_member((select group_id from public.participants where id = p_participant_id));
$$;

create policy "Read invites you sent, got, or that are in your groups" on public.group_invites
  for select to authenticated
  using (private.can_see_invite(participant_id, invited_user_id, invited_by));

-- Invites an account to be a person in your group. Replaces any earlier pending invite for them.
create function public.invite_to_group(p_participant_id uuid, p_user_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.participants;
  new_id uuid;
begin
  select * into target from public.participants where id = p_participant_id;
  if not found or not private.is_group_member(target.group_id) then
    raise exception 'You are not in this group' using errcode = 'insufficient_privilege';
  end if;
  if target.user_id is not null then
    raise exception 'They already have an account in this group' using errcode = 'invalid_parameter_value';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You can’t invite yourself' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'No one has that username' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.participants where group_id = target.group_id and user_id = p_user_id) then
    raise exception 'They’re already in this group' using errcode = 'invalid_parameter_value';
  end if;

  update public.group_invites
    set status = 'cancelled', decided_at = now()
    where participant_id = p_participant_id and status = 'pending';
  insert into public.group_invites (participant_id, invited_user_id, invited_by)
    values (p_participant_id, p_user_id, auth.uid())
    returning id into new_id;
  return new_id;
end;
$$;

-- Accept or decline an invite sent to you. Accepting makes you that person in the group, so
-- its expenses (including earlier ones) show in your account. Returns the group's id.
create function public.respond_to_invite(p_invite_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invite record;
begin
  select i.id, i.participant_id, p.group_id, p.user_id as linked_user
    into invite
    from public.group_invites i
    join public.participants p on p.id = i.participant_id
    where i.id = p_invite_id and i.invited_user_id = auth.uid() and i.status = 'pending'
    for update of i;
  if not found then
    raise exception 'Invite not found, or already answered' using errcode = 'no_data_found';
  end if;

  if p_accept then
    if exists (select 1 from public.participants where group_id = invite.group_id and user_id = auth.uid()) then
      raise exception 'You’re already in this group' using errcode = 'invalid_parameter_value';
    end if;
    if invite.linked_user is not null then
      raise exception 'Someone else already joined as this person' using errcode = 'invalid_parameter_value';
    end if;
    update public.participants
      set user_id = auth.uid(),
          display_name = (select display_name from public.profiles where id = auth.uid())
      where id = invite.participant_id;
  end if;

  update public.group_invites
    set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
    where id = p_invite_id;
  return invite.group_id;
end;
$$;

create function public.cancel_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.group_invites
    set status = 'cancelled', decided_at = now()
    where id = p_invite_id and invited_by = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Invite not found, or already answered' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Your pending invites, newest first, with what you need to decide.
create function public.my_invites()
returns table (
  invite_id uuid,
  group_id uuid,
  group_name text,
  invited_by_name text,
  invited_by_username text,
  added_as text,
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select i.id, g.id, g.name, inviter.display_name, inviter.username, p.display_name, i.created_at
  from public.group_invites i
  join public.participants p on p.id = i.participant_id
  join public.groups g on g.id = p.group_id
  join public.profiles inviter on inviter.id = i.invited_by
  where i.invited_user_id = auth.uid() and i.status = 'pending'
  order by i.created_at desc;
$$;

-- Adding people, with an optional invite ----------------------------------------

-- Adds a person to a group you're in, and invites an account to be them if one is given.
create function public.add_person(
  p_group_id uuid,
  p_display_name text,
  p_phone text default null,
  p_invite_user_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.is_group_member(p_group_id)
     or exists (select 1 from public.groups where id = p_group_id and is_personal) then
    raise exception 'You can’t add people to this group' using errcode = 'insufficient_privilege';
  end if;
  insert into public.participants (group_id, display_name, phone)
    values (p_group_id, btrim(p_display_name), nullif(btrim(coalesce(p_phone, '')), ''))
    returning id into new_id;
  if p_invite_user_id is not null then
    perform public.invite_to_group(new_id, p_invite_user_id);
  end if;
  return new_id;
end;
$$;

drop function public.create_group(text, jsonb, boolean);

-- p_people: [{ "display_name": text, "phone": "+1…" | null, "invite_user_id": uuid | null }]
create function public.create_group(p_name text, p_people jsonb default '[]', p_one_off boolean default false)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_name text;
  new_group_id uuid;
  person record;
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

  -- One at a time, in the order given, so each keeps its place and can be invited.
  for person in
    select * from jsonb_to_recordset(p_people) as x(display_name text, phone text, invite_user_id uuid)
  loop
    perform public.add_person(new_group_id, person.display_name, person.phone, person.invite_user_id);
  end loop;

  return new_group_id;
end;
$$;

revoke execute on function
  public.find_user(text),
  public.username_available(text),
  public.invite_to_group(uuid, uuid),
  public.respond_to_invite(uuid, boolean),
  public.cancel_invite(uuid),
  public.my_invites(),
  public.add_person(uuid, text, text, uuid),
  public.create_group(text, jsonb, boolean)
  from public, anon;
grant execute on function
  public.find_user(text),
  public.username_available(text),
  public.invite_to_group(uuid, uuid),
  public.respond_to_invite(uuid, boolean),
  public.cancel_invite(uuid),
  public.my_invites(),
  public.add_person(uuid, text, text, uuid),
  public.create_group(text, jsonb, boolean)
  to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.can_see_invite(uuid, uuid, uuid) to authenticated;
