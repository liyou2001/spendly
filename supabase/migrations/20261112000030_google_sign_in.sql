-- Signing in with Google. Supabase Auth links a Google sign-in to an existing account with the
-- same (verified) email, so email codes and Google open the same account. One case would still
-- make a second account for the same person: signing up with an email that another account
-- added as a receipt address (Me → Forward receipts). Supabase Auth calls this hook before it
-- creates any user, by email code or Google, and it refuses those sign-ups.

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  new_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  -- A new user has no addresses yet, so a verified one here belongs to someone else.
  if new_email <> '' and exists (
    select 1 from public.verified_emails
    where email = new_email and verified_at is not null
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 409,
      'message', 'This email is already added to another Spendly account as a receipt address. '
        || 'Sign in with that account, or remove it there first.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
