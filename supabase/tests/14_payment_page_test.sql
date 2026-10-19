-- Private payment links, what the payment page sees, claims and notes from it, push tokens,
-- rate limits and auto-confirm.
-- Apartment: Leo ...0001 (paid the $140 Costco trip), Jeff ...0002, Maya ...0003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;
create function tests.hash(p_token text) returns text language sql as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;
create table tests.links (name text primary key, token text);
grant all on tests.links to public;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}');

-- Making and revoking links ------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into tests.links values ('jeff', public.create_share_link('33333333-3333-3333-3333-333333330002'));

select ok(length((select token from tests.links)) = 32, 'Leo gets a 32-character link token for Jeff');
select tests.as_service();
select is(
  (select count(*)::int from public.share_links where token_hash = (select token from tests.links)),
  0, 'The token itself is never stored'
);
select is(
  (select count(*)::int from public.share_links where token_hash = tests.hash((select token from tests.links))),
  1, 'Only its hash is'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(public.active_share_links('33333333-3333-3333-3333-333333330002'), 1, 'Leo sees Jeff has one working link');
select throws_ok(
  $$select public.create_share_link('33333333-3333-3333-3333-333333330001')$$,
  '22023', null, 'Nobody makes a link for themselves'
);
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_share_link('33333333-3333-3333-3333-333333330002')$$,
  'P0002', null, 'Someone outside the group can’t make one'
);
select is(public.active_share_links('33333333-3333-3333-3333-333333330002'), 0, 'Or see Leo’s');

-- What the page sees (Rule 5) ------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.link_share(tests.hash((select token from tests.links)))$$,
  '42501', null, 'Signed-in users can’t call the page’s functions directly'
);
select tests.as_service();
create temp table page as select public.link_share(tests.hash((select token from tests.links))) as body;
grant select on page to public;

select results_eq(
  $$select body->>'person_name', body->>'payer_name', (body->>'owed_cents')::bigint,
      body->'handles'->>'venmo' from page$$,
  $$values ('Jeff', 'Leo', 1500::bigint, 'leo-example')$$,
  'Jeff’s link: Leo says he owes $15.00, with Leo’s Venmo'
);
select results_eq(
  $$select i->>'name' from page, jsonb_array_elements(body->'expenses') e, jsonb_array_elements(e->'items') i$$,
  $$values ('Paper towels'), ('Dish soap'), ('Trash bags')$$,
  'It lists only the 3 shared items'
);
select results_eq(
  $$select e->>'merchant', (e->>'amount_cents')::bigint from page, jsonb_array_elements(body->'expenses') e$$,
  $$values ('Costco', 1500::bigint)$$,
  'and Jeff’s $15.00 share of the Costco trip'
);
select ok(
  (select body::text !~* 'protein|graphic tee|granola|oat milk|hummus|veggie|maya|14000|4200|8300' from page),
  'Nothing about Leo’s or Maya’s items, Maya, or the $140 total is in the response'
);
select ok(
  (select not (body->'expenses'->0 ? 'total_cents') from page),
  'Expenses carry no total'
);
select throws_ok(
  $$select public.link_share(tests.hash('not-a-real-token'))$$,
  'P0002', null, 'A made-up token gets nothing'
);

-- "I paid Leo" from the page -----------------------------------------------------------------
select throws_ok(
  $$select public.link_claim(tests.hash((select token from tests.links)), 2000)$$,
  '22023', null, 'Jeff can’t claim more than he owes'
);
select lives_ok(
  $$select public.link_claim(tests.hash((select token from tests.links)), 1000, 'venmo')$$,
  'Jeff says he paid $10.00 of it'
);
select results_eq(
  $$select (public.link_share(tests.hash((select token from tests.links)))->>'pending_cents')::bigint$$,
  $$values (1000::bigint)$$,
  'The page shows $10.00 waiting for Leo'
);
select throws_ok(
  $$select public.link_claim(tests.hash((select token from tests.links)), 600)$$,
  '22023', null, 'Only $5.00 is left to claim while that waits'
);

select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.decide_payment((select id from public.payments where status = 'claimed'), true)$$,
  'Leo confirms it in the app'
);
select tests.as_service();
select results_eq(
  $$select (public.link_share(tests.hash((select token from tests.links)))->>'owed_cents')::bigint$$,
  $$values (500::bigint)$$,
  'Jeff now owes $5.00'
);

-- "Something looks wrong" ----------------------------------------------------------------------
select lives_ok(
  $$select public.link_flag(tests.hash((select token from tests.links)), 'I didn’t get dish soap')$$,
  'Jeff sends Leo a note'
);
select tests.as_user('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select message from public.problem_reports where resolved_at is null$$,
  $$values ('I didn’t get dish soap')$$,
  'Leo sees it'
);
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty($$select * from public.problem_reports$$, 'Nobody else does');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.resolve_problem((select id from public.problem_reports))$$,
  'Leo dismisses it'
);

-- Zelle -------------------------------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$update public.profiles set zelle_contact = 'not an email' where id = auth.uid()$$,
  '23514', null, 'A Zelle contact must be an email or a US phone number'
);
select lives_ok(
  $$update public.profiles set zelle_contact = 'leo@example.com' where id = auth.uid()$$,
  'Leo adds his Zelle email'
);
select tests.as_service();
select is(
  public.link_share(tests.hash((select token from tests.links)))->'handles'->>'zelle',
  'leo@example.com', 'Jeff’s page shows where to send it by Zelle'
);

-- Text opt-in (Rule 8) ----------------------------------------------------------------------------
select tests.as_service();
select public.link_text_opt_in(tests.hash((select token from tests.links)), '+16085550188', true);
select results_eq(
  $$select phone::text, source from public.sms_consents where revoked_at is null$$,
  $$values ('+16085550188', 'payment_page')$$,
  'Checking the box saves Jeff’s own number with where it came from'
);
select public.link_text_opt_in(tests.hash((select token from tests.links)), null, false);
select is_empty(
  $$select * from public.sms_consents where revoked_at is null$$,
  'Unchecking it revokes the consent'
);

-- Revoking --------------------------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select is(public.revoke_share_links('33333333-3333-3333-3333-333333330002'), 1, 'Leo revokes Jeff’s link');
select tests.as_service();
select throws_ok(
  $$select public.link_share(tests.hash((select token from tests.links)))$$,
  'P0002', null, 'A revoked link stops working'
);

-- Rate limits -------------------------------------------------------------------------------------------
select results_eq(
  $$select public.hit_rate_limit('test', 2, 60) from generate_series(1, 3)$$,
  $$values (true), (true), (false)$$,
  'A third hit in the window is refused'
);

-- Push tokens -----------------------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.register_push_token('nope')$$,
  '22023', null, 'Only Expo push tokens are saved'
);
select public.register_push_token('ExponentPushToken[abc123]');
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.register_push_token('ExponentPushToken[abc123]');
select tests.as_service();
select results_eq(
  $$select user_id from public.push_tokens$$,
  $$values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid)$$,
  'A phone’s token moves to whoever signed in last'
);

-- Auto-confirm --------------------------------------------------------------------------------------------
reset role;
update public.profiles set auto_confirm_days = 3 where id = '11111111-1111-1111-1111-111111111111';
insert into public.payments (group_id, from_participant, to_participant, amount_cents, kind, status, created_at)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330003',
        '33333333-3333-3333-3333-333333330001', 4200, 'payment', 'claimed', now() - interval '4 days'),
       ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333330003',
        '33333333-3333-3333-3333-333333330001', 100, 'payment', 'claimed', now() - interval '1 day');
select is(private.auto_confirm_claims(), 1, 'With auto-confirm after 3 days on, a 4-day-old claim confirms');
select results_eq(
  $$select amount_cents, status from public.payments where from_participant = '33333333-3333-3333-3333-333333330003' order by amount_cents$$,
  $$values (100::bigint, 'claimed'), (4200::bigint, 'confirmed')$$,
  'and a 1-day-old one still waits'
);

select * from finish();
rollback;
