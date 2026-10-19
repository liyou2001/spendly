-- Renaming yourself updates your name in every group, and what others see.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to public;

-- Jeff signs up and is linked to the Jeff participant, so he sees his share of Costco.
insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff@example.com', '{"display_name": "Jeff"}');
update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = '33333333-3333-3333-3333-333333330002';

select tests.as_user('11111111-1111-1111-1111-111111111111');
update public.profiles set display_name = 'Leo Kim' where id = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$select distinct display_name from public.participants
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('Leo Kim')$$,
  'Leo''s new name is used in his Personal group and the Apartment'
);
select results_eq(
  $$select display_name from public.participants
    where id = '33333333-3333-3333-3333-333333330003'$$,
  $$values ('Maya')$$,
  'Other people''s names are untouched'
);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$select payer_name from public.get_my_shares()$$,
  $$values ('Leo Kim')$$,
  'Jeff sees Leo''s new name as the payer of his share'
);

select * from finish();
rollback;
