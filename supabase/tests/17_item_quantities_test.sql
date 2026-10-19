-- Quantities and per-person units on items: "3 × Soft drink" $7.50, Jeff 2 and Maya 1.
-- Apartment: Leo ...0001, Jeff ...0002, Maya ...0003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create schema tests;
grant usage on schema tests to public;
create function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
-- Saves "3 × Soft drink" for Jeff and Maya with the given items JSON.
create function tests.save_drinks(p_items jsonb) returns uuid language sql as $$
  select public.save_expense(
    p_group_id => '22222222-2222-2222-2222-222222222222',
    p_paid_by => '33333333-3333-3333-3333-333333330001',
    p_merchant => 'Pizza place',
    p_expense_date => '2026-10-18',
    p_total_cents => 750,
    p_shares => '[{"participant_id": "33333333-3333-3333-3333-333333330002", "amount_cents": 500},
                  {"participant_id": "33333333-3333-3333-3333-333333330003", "amount_cents": 250}]',
    p_items => p_items
  );
$$;
create table tests.saved (id uuid);
grant all on tests.saved to public;
grant execute on all functions in schema tests to public;

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'jeff@example.com', '{"display_name": "Jeff"}');
update public.participants set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = '33333333-3333-3333-3333-333333330002';

select tests.as_user('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into tests.saved select tests.save_drinks(
    '[{"name": "Soft drink", "amount_cents": 750, "kind": "item", "quantity": 3,
       "participant_ids": ["33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"],
       "units": [2, 1]}]')$$,
  'Leo saves 3 × Soft drink, Jeff 2 and Maya 1'
);
select results_eq(
  $$select i.quantity, p.display_name, a.units
    from public.expense_items i
    join public.item_assignments a on a.item_id = i.id
    join public.participants p on p.id = a.participant_id
    where i.expense_id = (select id from tests.saved)
    order by p.display_name$$,
  $$values (3, 'Jeff', 2), (3, 'Maya', 1)$$,
  'The quantity and each person’s units are stored'
);
select tests.save_drinks(
  '[{"name": "Pizza", "amount_cents": 750, "kind": "item", "quantity": 2,
     "participant_ids": ["33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"]}]');
select results_eq(
  $$select name, by_units from public.expense_items
    where expense_id in (select id from public.expenses where merchant = 'Pizza place')
    order by name$$,
  $$values ('Pizza', false), ('Soft drink', true)$$,
  'Tagged lines are marked by_units; an even split of 2 × Pizza is not'
);
select results_eq(
  $$select i.quantity, a.units from public.expense_items i
    join public.item_assignments a on a.item_id = i.id
    where i.expense_id = '44444444-4444-4444-4444-444444444444' and i.name = 'Paper towels'
    limit 1$$,
  $$values (1, 1)$$,
  'Items saved before quantities have quantity 1 and 1 unit each'
);

select throws_ok(
  $$select tests.save_drinks('[{"name": "Soft drink", "amount_cents": 750, "kind": "item", "quantity": 3,
      "participant_ids": ["33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"],
      "units": [1, 1]}]')$$,
  '22023', null, 'Units must add up to the quantity'
);
select throws_ok(
  $$select tests.save_drinks('[{"name": "Soft drink", "amount_cents": 750, "kind": "item", "quantity": 3,
      "participant_ids": ["33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"],
      "units": [3]}]')$$,
  '22023', null, 'One count per person'
);
select throws_ok(
  $$select tests.save_drinks('[{"name": "Soft drink", "amount_cents": 750, "kind": "item", "quantity": 3,
      "participant_ids": ["33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"],
      "units": [3, 0]}]')$$,
  '22023', null, 'Every count is at least 1'
);
select throws_ok(
  $$select tests.save_drinks('[{"name": "Soft drink", "amount_cents": 700, "kind": "item",
      "participant_ids": ["33333333-3333-3333-3333-333333330002", "33333333-3333-3333-3333-333333330003"]},
      {"name": "Tax", "amount_cents": 50, "kind": "tax", "quantity": 2}]')$$,
  '22023', null, 'Tax, tip and discounts have no quantity'
);
select throws_ok(
  $$select tests.save_drinks('[{"name": "Soft drink", "amount_cents": 750, "kind": "item", "quantity": 0,
      "participant_ids": ["33333333-3333-3333-3333-333333330002"]}]')$$,
  '22023', null, 'Quantities start at 1'
);

-- Jeff's own share shows how many were his, and how many there were.
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$select item->>'name', (item->>'quantity')::int, (item->>'my_units')::int, (item->>'total_units')::int,
           (item->>'split_count')::int
    from public.get_my_shares(), jsonb_array_elements(items) item
    where merchant = 'Pizza place' and item->>'name' = 'Soft drink'$$,
  $$values ('Soft drink', 3, 2, 3, 2)$$,
  'Jeff’s share shows 3 × Soft drink, 2 of them his'
);

-- Maya's payment link shows her 1 of the 3.
select tests.as_user('11111111-1111-1111-1111-111111111111');
create temp table maya_link as
  select public.create_share_link('33333333-3333-3333-3333-333333330003') as token;
grant select on maya_link to public;
reset role;
select results_eq(
  $$select (item->>'quantity')::int, (item->>'by_units')::boolean,
           (select string_agg(x->>'units', ',' order by x->>'ref') from jsonb_array_elements(item->'people') x)
    from jsonb_array_elements(
      public.link_share(encode(extensions.digest((select token from maya_link), 'sha256'), 'hex'))->'expenses'
    ) e, jsonb_array_elements(e->'items') item
    where e->>'merchant' = 'Pizza place' and item->>'name' = 'Soft drink'$$,
  $$values (3, true, '2,1')$$,
  'Maya’s payment page shows 3 × Soft drink tagged Jeff 2, Maya 1'
);

select * from finish();
rollback;
