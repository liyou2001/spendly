-- Local seed: the plan's Costco example.
-- Leo has an account (leo@example.com). Jeff and Maya are name-only participants.
-- Leo paid $140.00: his own items $68.00, household items $45.00 split three ways,
-- Maya's food $27.00. Expected: Leo 8300, Jeff 1500, Maya 4200.
--
-- Fixed ids make the seed easy to reference from tests and the app:
--   Leo's user        11111111-1111-1111-1111-111111111111
--   Apartment group   22222222-2222-2222-2222-222222222222
--   Leo / Jeff / Maya 33333333-3333-3333-3333-33333333000{1,2,3}
--   Costco expense    44444444-4444-4444-4444-444444444444

-- Leo's account. The signup trigger creates his profile, Personal group and categories.
-- Token columns are '' rather than null because Supabase Auth can't read nulls there.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'leo@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"display_name": "Leo"}',
  now(),
  now(),
  '', '', '', ''
);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub": "11111111-1111-1111-1111-111111111111", "email": "leo@example.com", "email_verified": true}',
  'email',
  now(),
  now(),
  now()
);

update public.profiles set venmo_username = 'leo-example'
where id = '11111111-1111-1111-1111-111111111111';

-- The apartment group.
insert into public.groups (id, name, created_by)
values ('22222222-2222-2222-2222-222222222222', 'Apartment', '11111111-1111-1111-1111-111111111111');

-- Jeff has a (fictional, 555-01xx) phone number, so Request payment opens Messages for him;
-- Maya has none, so hers opens the share sheet.
insert into public.participants (id, group_id, display_name, user_id, phone)
values
  ('33333333-3333-3333-3333-333333330001', '22222222-2222-2222-2222-222222222222', 'Leo',
   '11111111-1111-1111-1111-111111111111', null),
  ('33333333-3333-3333-3333-333333330002', '22222222-2222-2222-2222-222222222222', 'Jeff', null,
   '+16085550123'),
  ('33333333-3333-3333-3333-333333330003', '22222222-2222-2222-2222-222222222222', 'Maya', null,
   null);

-- The Costco expense, in Leo's Groceries category.
insert into public.expenses (
  id, group_id, paid_by, merchant, expense_date, total_cents, category_id, source, created_by
)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333330001',
  'Costco',
  '2026-10-17',
  14000,
  (select id from public.categories
   where user_id = '11111111-1111-1111-1111-111111111111' and name = 'Groceries'),
  'manual',
  '11111111-1111-1111-1111-111111111111'
);

with items (position, name, amount_cents, people) as (
  values
    (0, 'Protein powder', 4799, array['33333333-3333-3333-3333-333333330001']),
    (1, 'Graphic tee', 1299, array['33333333-3333-3333-3333-333333330001']),
    (2, 'Granola bars', 702, array['33333333-3333-3333-3333-333333330001']),
    (3, 'Paper towels', 2299, array['33333333-3333-3333-3333-333333330001',
                                    '33333333-3333-3333-3333-333333330002',
                                    '33333333-3333-3333-3333-333333330003']),
    (4, 'Dish soap', 1149, array['33333333-3333-3333-3333-333333330001',
                                 '33333333-3333-3333-3333-333333330002',
                                 '33333333-3333-3333-3333-333333330003']),
    (5, 'Trash bags', 1052, array['33333333-3333-3333-3333-333333330001',
                                  '33333333-3333-3333-3333-333333330002',
                                  '33333333-3333-3333-3333-333333330003']),
    (6, 'Oat milk', 1249, array['33333333-3333-3333-3333-333333330003']),
    (7, 'Hummus', 899, array['33333333-3333-3333-3333-333333330003']),
    (8, 'Veggie chips', 552, array['33333333-3333-3333-3333-333333330003'])
),
inserted as (
  insert into public.expense_items (expense_id, name, amount_cents, kind, position)
  select '44444444-4444-4444-4444-444444444444', name, amount_cents, 'item', position
  from items
  returning id, position
)
insert into public.item_assignments (item_id, participant_id)
select inserted.id, unnest(items.people)::uuid
from inserted
join items using (position);

-- The shares computeShares gives for this receipt.
insert into public.shares (expense_id, participant_id, amount_cents)
values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333330001', 8300),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333330002', 1500),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333330003', 4200);
