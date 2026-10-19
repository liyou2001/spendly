-- Usernames, find_user, and in-app invites.
-- Apartment: Leo ...0001 (has an account, paid the Costco trip), Jeff ...0002 and Maya ...0003
-- (name-only).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.invite_for(p_user uuid) returns uuid language sql security definer as $$
  select id from public.group_invites where invited_user_id = p_user and status = 'pending'
  order by created_at desc limit 1;
$$;
create function tests.participant(p_group text, p_name text) returns uuid language sql security definer as $$
  select p.id from public.participants p join public.groups g on g.id = p.group_id
  where g.name = p_group and p.display_name = p_name;
$$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff.k@example.com', '{"display_name": "Jeff Kim"}'),
       ('aaaaaaaa-0000-0000-0000-000000000003', 'leo@elsewhere.com', '{"display_name": "Other Leo"}');

-- Usernames -----------------------------------------------------------------------
select is((select username from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'leo', 'Leo got a username from his email name');
select is((select username from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'leo1', 'A taken name gets a number added');
select is((select username from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'jeff.k', 'Dots are kept');

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$update public.profiles set username = 'Bad Name' where id = auth.uid()$$,
  '23514', null, 'Usernames are lowercase letters, numbers, _ and . only');
select throws_ok($$update public.profiles set username = 'leo' where id = auth.uid()$$,
  '23505', null, 'Usernames are unique');
select lives_ok($$update public.profiles set username = 'sam_w' where id = auth.uid()$$,
  'Sam picks a free username');

select results_eq($$select display_name, username from public.find_user('@Leo')$$,
  $$values ('Leo', 'leo')$$, 'find_user matches exactly, ignoring case and a leading @');
select is_empty($$select * from public.find_user('le')$$, 'Partial names find no one');
select is(public.username_available('leo'), false, 'Someone else’s username is not available');
select is(public.username_available('sam_w'), true, 'Your own username counts as available');
select is(public.username_available('brand.new'), true, 'A free username is available');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is_empty($$select * from public.find_user('leo')$$, 'find_user never returns yourself');

-- Inviting Jeff's account to be Jeff ---------------------------------------------------
select lives_ok(
  $$select public.invite_to_group('33333333-3333-3333-3333-333333330002',
      (select user_id from public.find_user('jeff.k')))$$,
  'Leo invites @jeff.k to be Jeff in the Apartment');

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty('select * from public.group_invites', 'Someone outside the group sees no invites');
select throws_ok(
  $$select public.respond_to_invite(tests.invite_for('aaaaaaaa-0000-0000-0000-000000000002'), true)$$,
  'P0002', null, 'Nobody can accept someone else’s invite');
select throws_ok(
  $$select public.invite_to_group('33333333-3333-3333-3333-333333330003',
      'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'Someone outside the group cannot invite people to it');

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq($$select group_name, invited_by_name, invited_by_username, added_as from public.my_invites()$$,
  $$values ('Apartment', 'Leo', 'leo', 'Jeff')$$, 'Jeff sees the invite: Apartment, from Leo, as Jeff');
select is_empty('select * from public.get_my_shares()', 'Before accepting, Jeff sees no shares');
select lives_ok(
  $$select public.respond_to_invite(tests.invite_for('aaaaaaaa-0000-0000-0000-000000000002'), true)$$,
  'Jeff accepts');
select results_eq($$select merchant, amount_cents from public.get_my_shares()$$,
  $$values ('Costco', 1500::bigint)$$, 'Jeff now sees his share of the Costco trip entered before he joined');

-- Claims work between the two accounts now.
select public.claim_payment('22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330001', 500);
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.decide_payment((select id from public.payments where status = 'claimed'), true);
select results_eq(
  $$select amount_cents from public.balances() where from_participant = '33333333-3333-3333-3333-333333330002'$$,
  $$values (1000::bigint)$$, 'Jeff says he paid 500, Leo taps Got it, and Jeff owes 1000');

select throws_ok(
  $$select public.invite_to_group('33333333-3333-3333-3333-333333330002', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '22023', null, 'A person who already has an account cannot be invited');

-- Declining, cancelling, and adding someone with an invite ---------------------------------
select public.add_person('22222222-2222-2222-2222-222222222222', 'Sam', null, 'aaaaaaaa-0000-0000-0000-000000000001');
select public.cancel_invite(tests.invite_for('aaaaaaaa-0000-0000-0000-000000000001'));
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty('select * from public.my_invites()', 'A cancelled invite disappears for the invitee');

select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.create_group('Ski trip',
  '[{"display_name": "Sam S", "invite_user_id": "aaaaaaaa-0000-0000-0000-000000000001"},
    {"display_name": "Also Sam"}]');
select public.invite_to_group(tests.participant('Ski trip', 'Also Sam'), 'aaaaaaaa-0000-0000-0000-000000000001');
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.respond_to_invite(
  (select invite_id from public.my_invites() where added_as = 'Sam S'), true);
select throws_ok(
  $$select public.respond_to_invite((select invite_id from public.my_invites() where added_as = 'Also Sam'), true)$$,
  '22023', null, 'You cannot accept a second invite into a group you’re already in');
select lives_ok(
  $$select public.respond_to_invite((select invite_id from public.my_invites() where added_as = 'Also Sam'), false)$$,
  'Sam declines the second one');

select * from finish();
rollback;
