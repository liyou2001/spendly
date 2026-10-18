-- Tables for the data model in docs/PLAN.md.
-- Money is always bigint cents (Rule 1). Ledger tables are append-only (Rule 2, see the next migration).

create extension if not exists pgcrypto with schema extensions;

-- Phone numbers are stored in E.164 form, e.g. +16085551234.
create domain public.e164_phone as text check (value ~ '^\+[1-9][0-9]{6,14}$');

-- People and groups ---------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  venmo_username text check (venmo_username ~ '^[A-Za-z0-9_-]{1,30}$'),
  paypal_username text check (paypal_username ~ '^[A-Za-z0-9]{1,20}$'),
  cashapp_tag text check (cashapp_tag ~ '^\$?[A-Za-z][A-Za-z0-9]{0,19}$'),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid not null references auth.users,
  is_personal boolean not null default false,
  created_at timestamptz not null default now()
);

-- Every user has exactly one Personal group.
create unique index groups_one_personal_per_user on public.groups (created_by) where is_personal;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  user_id uuid references auth.users on delete set null,
  phone public.e164_phone,
  created_at timestamptz not null default now(),
  -- Lets other tables require that a participant belongs to a specific group.
  unique (id, group_id)
);

-- An account appears at most once per group.
create unique index participants_one_per_user_per_group
  on public.participants (group_id, user_id) where user_id is not null;
create index participants_user_id on public.participants (user_id);

-- Budgets -------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index categories_unique_name_per_user on public.categories (user_id, lower(name));

create table public.budgets (
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid not null,
  month date not null check (month = date_trunc('month', month)::date),
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (user_id, category_id, month),
  -- The category must belong to the same user.
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- Ledger (append-only) ------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups,
  paid_by uuid not null,
  merchant text not null check (length(btrim(merchant)) between 1 and 200),
  expense_date date not null,
  total_cents bigint not null check (total_cents > 0),
  -- The payer's own category.
  category_id uuid references public.categories,
  source text not null default 'manual' check (source in ('manual', 'photo', 'email')),
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users,
  replaces_expense_id uuid unique references public.expenses,
  foreign key (paid_by, group_id) references public.participants (id, group_id),
  check ((voided_at is null) = (voided_by is null)),
  check (replaces_expense_id <> id)
);

create index expenses_group_id on public.expenses (group_id);
create index expenses_paid_by on public.expenses (paid_by);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses,
  name text not null check (length(btrim(name)) between 1 and 200),
  amount_cents bigint not null,
  kind text not null check (kind in ('item', 'tax', 'tip', 'discount')),
  position integer not null check (position >= 0),
  unique (expense_id, position),
  -- Positive amounts, except discounts, which are negative.
  check (case when kind = 'discount' then amount_cents < 0 else amount_cents > 0 end)
);

create table public.item_assignments (
  item_id uuid not null references public.expense_items,
  participant_id uuid not null references public.participants,
  primary key (item_id, participant_id)
);

create index item_assignments_participant_id on public.item_assignments (participant_id);

create table public.shares (
  expense_id uuid not null references public.expenses,
  participant_id uuid not null references public.participants,
  amount_cents bigint not null check (amount_cents >= 0),
  -- The participant's own category for this share.
  category_override_id uuid references public.categories,
  primary key (expense_id, participant_id)
);

create index shares_participant_id on public.shares (participant_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups,
  from_participant uuid not null,
  to_participant uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  kind text not null check (kind in ('payment', 'forgiveness')),
  -- The expense a forgiveness belongs to. Payments aren't tied to one expense.
  expense_id uuid references public.expenses,
  status text not null check (status in ('claimed', 'confirmed', 'rejected')),
  method text check (method in ('venmo', 'paypal', 'cashapp', 'cash', 'other')),
  -- Null when claimed from the payment page by someone without an account.
  recorded_by uuid references auth.users,
  decided_by uuid references auth.users,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (from_participant, group_id) references public.participants (id, group_id),
  foreign key (to_participant, group_id) references public.participants (id, group_id),
  check (from_participant <> to_participant),
  check ((kind = 'forgiveness') = (expense_id is not null)),
  check (kind = 'payment' or status = 'confirmed'),
  check ((status = 'claimed') = (decided_at is null)),
  check (status = 'claimed' or decided_by is not null)
);

create index payments_group_id on public.payments (group_id);
create index payments_from_participant on public.payments (from_participant);
create index payments_to_participant on public.payments (to_participant);

-- Payment page, texting -----------------------------------------------------

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.sms_consents (
  id uuid primary key default gen_random_uuid(),
  phone public.e164_phone not null,
  participant_id uuid references public.participants,
  user_id uuid references auth.users on delete set null,
  consented_at timestamptz not null default now(),
  source text not null check (source in ('payment_page', 'app')),
  revoked_at timestamptz,
  check (participant_id is not null or user_id is not null)
);

create index sms_consents_phone on public.sms_consents (phone);

create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  to_phone public.e164_phone not null,
  body text not null,
  status text not null check (status in ('logged', 'sent', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);

-- Receipts ------------------------------------------------------------------

create table public.receipt_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('photo', 'email')),
  storage_path text,
  model text,
  status text not null check (status in ('pending', 'succeeded', 'mismatch', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  from_address text not null,
  user_id uuid references auth.users on delete set null,
  status text not null check (
    status in ('received', 'processing', 'drafted', 'duplicate', 'unknown_sender', 'failed')
  ),
  error text,
  received_at timestamptz not null default now()
);

create table public.verified_emails (
  user_id uuid not null references auth.users on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  -- Null until the user enters the code sent to the address.
  verified_at timestamptz,
  primary key (user_id, email)
);

-- A verified address belongs to one user.
create unique index verified_emails_one_owner on public.verified_emails (email)
  where verified_at is not null;

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index push_tokens_user_id on public.push_tokens (user_id);
