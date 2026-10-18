-- save_expense and void_expense.
-- Apartment participants: Leo ...0001, Jeff ...0002, Maya ...0003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
-- A user's category by name. Security definer so tests can name categories the caller can't see.
create function tests.category_of(p_user uuid, p_name text) returns uuid language sql security definer as $$
  select id from public.categories where user_id = p_user and name = p_name;
$$;
create function tests.leo_category(p_name text) returns uuid language sql as $$
  select tests.category_of('11111111-1111-1111-1111-111111111111', p_name);
$$;
-- The Costco receipt as save_expense takes it. The shares are what computeShares gives.
create function tests.costco_items() returns jsonb language sql as $$
  select '[
    {"name": "Protein powder", "amount_cents": 4799, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001"]},
    {"name": "Graphic tee", "amount_cents": 1299, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001"]},
    {"name": "Granola bars", "amount_cents": 702, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001"]},
    {"name": "Paper towels", "amount_cents": 2299, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001", "33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"]},
    {"name": "Dish soap", "amount_cents": 1149, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001", "33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"]},
    {"name": "Trash bags", "amount_cents": 1052, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001", "33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"]},
    {"name": "Oat milk", "amount_cents": 1249, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330003"]},
    {"name": "Hummus", "amount_cents": 899, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330003"]},
    {"name": "Veggie chips", "amount_cents": 552, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330003"]}
  ]'::jsonb;
$$;
create function tests.costco_shares(p_maya bigint default 4200) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330001', 'amount_cents', 8300),
    jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330002', 'amount_cents', 1500),
    jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330003', 'amount_cents', p_maya)
  );
$$;
-- Saves an Apartment expense paid by Leo, varying only what a test needs.
create function tests.save(
  p_merchant text,
  p_total bigint default 14000,
  p_shares jsonb default tests.costco_shares(),
  p_items jsonb default tests.costco_items(),
  p_paid_by uuid default '33333333-3333-3333-3333-333333330001',
  p_category uuid default tests.leo_category('Groceries'),
  p_replaces uuid default null
) returns uuid language sql as $$
  select public.save_expense(
    p_group_id => '22222222-2222-2222-2222-222222222222',
    p_paid_by => p_paid_by,
    p_merchant => p_merchant,
    p_expense_date => '2026-10-17',
    p_total_cents => p_total,
    p_shares => p_shares,
    p_items => p_items,
    p_category_id => p_category,
    p_replaces_expense_id => p_replaces
  );
$$;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'sam@example.com', '{"display_name": "Sam"}');

select tests.as_user('11111111-1111-1111-1111-111111111111');

-- Saving the Costco receipt ----------------------------------------------------
select lives_ok($$select tests.save('Costco run 2')$$, 'Leo saves the Costco receipt');

select results_eq(
  $$select total_cents, source, created_by, category_id = tests.leo_category('Groceries')
    from public.expenses where merchant = 'Costco run 2'$$,
  $$values (14000::bigint, 'manual', '11111111-1111-1111-1111-111111111111'::uuid, true)$$,
  'The expense row has the total, source, creator and Leo''s category'
);
select results_eq(
  $$select i.name, i.position, i.kind, count(a.*)
    from public.expense_items i
    join public.expenses e on e.id = i.expense_id
    left join public.item_assignments a on a.item_id = i.id
    where e.merchant = 'Costco run 2'
    group by i.id order by i.position$$,
  $$values ('Protein powder', 0, 'item', 1::bigint), ('Graphic tee', 1, 'item', 1::bigint),
           ('Granola bars', 2, 'item', 1::bigint), ('Paper towels', 3, 'item', 3::bigint),
           ('Dish soap', 4, 'item', 3::bigint), ('Trash bags', 5, 'item', 3::bigint),
           ('Oat milk', 6, 'item', 1::bigint), ('Hummus', 7, 'item', 1::bigint),
           ('Veggie chips', 8, 'item', 1::bigint)$$,
  'All 9 items are saved in order with their assignments'
);
select results_eq(
  $$select s.amount_cents from public.shares s join public.expenses e on e.id = s.expense_id
    where e.merchant = 'Costco run 2' order by s.participant_id$$,
  $$values (8300::bigint), (1500::bigint), (4200::bigint)$$,
  'Shares are saved: Leo 8300, Jeff 1500, Maya 4200'
);
select results_eq(
  $$select amount_cents from public.balances() order by from_participant$$,
  $$values (3000::bigint), (8400::bigint)$$,
  'Balances now include both Costco trips'
);

-- Shares and items must add up -------------------------------------------------
select throws_ok(
  $$select tests.save('Bad shares', p_shares => tests.costco_shares(4199))$$,
  '23514',
  'Shares sum to 13999 but the total is 14000',
  'Rejects shares that do not sum to the total'
);
select throws_ok(
  $$select tests.save('Bad items', p_items => tests.costco_items() - 8)$$,
  '23514',
  'Items sum to 13448 but the total is 14000',
  'Rejects items that do not sum to the total'
);
select throws_ok(
  $$select tests.save('Bad total', p_total => 0, p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 0}]', p_items => '[]')$$,
  '22023', null,
  'Rejects a zero total'
);

-- Amounts are whole, non-negative cents ------------------------------------------------
select throws_ok(
  $$select tests.save('Fractional', p_total => 1500, p_items => '[]',
      p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 1500.5}]')$$,
  '22P02', null,
  'Rejects fractional cents'
);
select throws_ok(
  $$select tests.save('Negative', p_total => 1000, p_items => '[]',
      p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 1500},
                    {"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": -500}]')$$,
  '22023', null,
  'Rejects a negative share'
);
select throws_ok(
  $$select tests.save('Duplicate', p_total => 1000, p_items => '[]',
      p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 500},
                    {"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 500}]')$$,
  '22023', null,
  'Rejects two shares for the same person'
);

-- People must be in the group ------------------------------------------------------
select throws_ok(
  $$select tests.save('Outsider', p_total => 1000, p_items => '[]',
      p_shares => jsonb_build_array(jsonb_build_object(
        'participant_id', (select id from public.participants
                           where user_id = '11111111-1111-1111-1111-111111111111'
                             and group_id <> '22222222-2222-2222-2222-222222222222'),
        'amount_cents', 1000)))$$,
  '22023', null,
  'Rejects a share for someone outside the group'
);
select throws_ok(
  $$select tests.save('Wrong payer', p_paid_by => (select id from public.participants
      where user_id = '11111111-1111-1111-1111-111111111111'
        and group_id <> '22222222-2222-2222-2222-222222222222'))$$,
  '22023', null,
  'Rejects a payer from another group'
);
select throws_ok(
  $$select tests.save('No share', p_total => 1000,
      p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 1000}]',
      p_items => '[{"name": "Snacks", "amount_cents": 1000, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330002"]}]')$$,
  '22023', null,
  'Rejects an item for someone who has no share'
);
select throws_ok(
  $$select tests.save('Tax with people', p_total => 1100,
      p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330001", "amount_cents": 1100}]',
      p_items => '[{"name": "Snacks", "amount_cents": 1000, "kind": "item", "participant_ids": ["33333333-3333-3333-3333-333333330001"]},
                   {"name": "Tax", "amount_cents": 100, "kind": "tax", "participant_ids": ["33333333-3333-3333-3333-333333330001"]}]')$$,
  '22023', null,
  'Rejects a tax line assigned to people (tax is split in proportion)'
);

-- Categories: only your own, only on your own share ---------------------------------------
select throws_ok(
  $$select tests.save('Sam''s category',
      p_category => tests.category_of('aaaaaaaa-0000-0000-0000-000000000001', 'Groceries'))$$,
  '22023', null,
  'Rejects another user''s category'
);
select throws_ok(
  $$select tests.save('Maya paid', p_paid_by => '33333333-3333-3333-3333-333333330003')$$,
  '22023', null,
  'Rejects an expense category when the caller is not the payer'
);
select throws_ok(
  $$select tests.save('Override', p_total => 2000, p_items => '[]', p_category => null,
      p_shares => jsonb_build_array(
        jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330001', 'amount_cents', 1000),
        jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330002', 'amount_cents', 1000,
                           'category_override_id', tests.leo_category('Fun'))))$$,
  '22023', null,
  'Rejects a category on someone else''s share'
);

-- Quick mode: a total split evenly, no items. Maya paid; Leo files his share under Dining.
select lives_ok(
  $$select tests.save('Pizza', p_total => 3000, p_items => '[]', p_category => null,
      p_paid_by => '33333333-3333-3333-3333-333333330003',
      p_shares => jsonb_build_array(
        jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330001', 'amount_cents', 1000,
                           'category_override_id', tests.leo_category('Dining')),
        jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330002', 'amount_cents', 1000),
        jsonb_build_object('participant_id', '33333333-3333-3333-3333-333333330003', 'amount_cents', 1000)))$$,
  'Saves a quick expense with no items, paid by someone else'
);
select results_eq(
  $$select c.name, s.amount_cents from public.my_spending() s
    join public.categories c on c.id = s.category_id where c.name = 'Dining'$$,
  $$values ('Dining', 1000::bigint)$$,
  'Leo''s share of Maya''s pizza counts under his Dining category'
);

-- Non-members ----------------------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$select tests.save('Sneaky', p_category => null)$$,
  '42501', null,
  'Someone outside the group cannot save expenses to it'
);
select tests.as_user('11111111-1111-1111-1111-111111111111');

-- Corrections and voiding ----------------------------------------------------------------
select lives_ok(
  $$select tests.save('Costco (fixed)', p_replaces => '44444444-4444-4444-4444-444444444444')$$,
  'Saves a correction that replaces the seeded Costco expense'
);
select results_eq(
  $$select old.voided_at is not null, old.voided_by, new.replaces_expense_id
    from public.expenses old, public.expenses new
    where old.id = '44444444-4444-4444-4444-444444444444' and new.merchant = 'Costco (fixed)'$$,
  $$values (true, '11111111-1111-1111-1111-111111111111'::uuid, '44444444-4444-4444-4444-444444444444'::uuid)$$,
  'The original is voided (kept in history) and the correction points to it'
);
select throws_ok(
  $$select tests.save('Costco (fixed again)', p_replaces => '44444444-4444-4444-4444-444444444444')$$,
  '22023', null,
  'An expense can only be replaced once'
);
select lives_ok(
  $$select public.void_expense((select id from public.expenses where merchant = 'Costco run 2'))$$,
  'Leo voids an expense he paid for'
);
select throws_ok(
  $$select public.void_expense((select id from public.expenses where merchant = 'Costco run 2'))$$,
  '22023', null,
  'An expense can only be voided once'
);

-- The commit-time check catches shares that don't add up, whatever inserted them.
select tests.as_owner();
insert into public.expenses (id, group_id, paid_by, merchant, expense_date, total_cents, created_by)
values ('eeeeeeee-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333330001', 'Direct insert', '2026-10-17', 1000,
        '11111111-1111-1111-1111-111111111111');
insert into public.shares (expense_id, participant_id, amount_cents)
values ('eeeeeeee-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333330001', 999);
select throws_ok(
  'set constraints all immediate',
  '23514', null,
  'Shares that do not sum to the total fail at commit, even when inserted directly'
);

select * from finish();
rollback;
