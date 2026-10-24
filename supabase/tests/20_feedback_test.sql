-- Feedback: you can send it, as yourself only, and nobody can read it back through the app.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to public;

select tests.as_user('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$insert into public.feedback (message, app_version, platform)
    values ('Splitting the Costco run was confusing', '1.0.0', 'ios')$$,
  'Leo can send feedback'
);
select throws_ok(
  $$insert into public.feedback (message) values ('   ')$$,
  '23514', null,
  'Blank feedback is rejected'
);
select throws_ok(
  $$insert into public.feedback (user_id, message)
    values ('aaaaaaaa-0000-0000-0000-000000000002', 'Pretending to be Jeff')$$,
  '42501', null,
  'Leo can''t send feedback as someone else'
);
select throws_ok(
  $$select * from public.feedback$$,
  '42501', null,
  'Leo can''t read feedback, not even his own'
);
select throws_ok(
  $$update public.feedback set message = 'Changed'$$,
  '42501', null,
  'Leo can''t change feedback'
);
select throws_ok(
  $$delete from public.feedback$$,
  '42501', null,
  'Leo can''t delete feedback'
);

reset role;
select results_eq(
  $$select user_id, message, app_version, platform from public.feedback$$,
  $$values ('11111111-1111-1111-1111-111111111111'::uuid,
            'Splitting the Costco run was confusing', '1.0.0', 'ios')$$,
  'The saved feedback is Leo''s, with his app version and platform'
);

select * from finish();
rollback;
