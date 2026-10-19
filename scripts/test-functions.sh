#!/usr/bin/env bash
# Runs the Edge Function tests against local Supabase. Needs `npm run db:start` and
# `npx supabase functions serve` running.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|ANON_KEY)=')"
export API_URL SERVICE_ROLE_KEY ANON_KEY
deno check --no-lock supabase/functions/*/index.ts
deno test --no-lock --allow-net --allow-env supabase/functions
