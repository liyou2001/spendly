#!/usr/bin/env bash
# Runs the Edge Function tests against local Supabase. Needs `npm run db:start` and
# `npx supabase functions serve` running.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|ANON_KEY)=')"
export API_URL SERVICE_ROLE_KEY ANON_KEY
# The inbound and cron secrets, if set for the functions, so tests can post as the Worker and
# as pg_cron.
if [ -f supabase/functions/.env ]; then
  INBOUND_SECRET="$(grep -E '^INBOUND_SECRET=' supabase/functions/.env | cut -d= -f2- || true)"
  CRON_SECRET="$(grep -E '^CRON_SECRET=' supabase/functions/.env | cut -d= -f2- || true)"
  export INBOUND_SECRET CRON_SECRET
fi
deno check --no-lock --node-modules-dir=none supabase/functions/*/index.ts
deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read supabase/functions
