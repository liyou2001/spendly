-- A scan counts toward the monthly limit only if a model actually read the photo (including
-- finding it unreadable). Attempts that failed on our side, like an API outage or no API
-- credits, don't use up anyone's scans.
create or replace function public.receipt_scans_this_month(p_user_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(distinct storage_path)::integer
  from public.receipt_extractions
  where user_id = p_user_id and source = 'photo'
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    and (status in ('succeeded', 'mismatch') or error like 'Unreadable:%');
$$;
