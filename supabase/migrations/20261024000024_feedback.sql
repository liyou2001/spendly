-- Feedback from Me → Send feedback. Anyone signed in can send it, but nobody can read it back
-- through the app, not even their own: it's read in the Supabase dashboard.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  app_version text check (char_length(app_version) <= 40),
  platform text check (char_length(platform) <= 20),
  created_at timestamptz not null default now()
);

create index feedback_created_at on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
-- user_id isn't grantable, so it's always the sender.
grant insert (message, app_version, platform) on public.feedback to authenticated;

create policy "Send your own feedback" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
