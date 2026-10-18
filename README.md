# Spendly

A budgeting app for college students that handles shared money correctly: your share of a split purchase counts in your budget, what roommates owe you is tracked separately, and repayments settle debts instead of counting as income.

The build plan is in [docs/PLAN.md](docs/PLAN.md). Project rules for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Repo layout

```
apps/mobile          Expo app (Expo Router, TypeScript)
packages/ledger      pure TypeScript money and split math (Vitest)
supabase/            Supabase config, migrations, Edge Functions, database tests
docs/                build plan and exported designs
```

`apps/pay` (the payment web page) is added in Step 8 if it isn't built from the Expo app.

## Prerequisites

- **Node 24.3+.** With nvm: `nvm install` then `nvm use` in the repo root (reads `.nvmrc`).
- **Docker Desktop**, running, for local Supabase.
- **Expo Go** on your phone (App Store / Google Play).

The Supabase CLI is installed as a dev dependency, so there's nothing to install globally. Run it as `npx supabase ...`.

## Setup

```sh
nvm use
npm install
cp .env.example apps/mobile/.env          # then delete the lines that aren't for the app
cp .env.example supabase/functions/.env   # then delete the lines that aren't for functions
```

`.env.example` lists every variable, grouped by where it goes and which step first needs it. Real `.env` files are git-ignored. Nothing needs a value yet in Step 1.

## Run the app

```sh
npm run mobile
```

This starts the Expo dev server and prints a QR code. Scan it with the Camera app (iPhone) or the Expo Go app (Android). Your phone and computer must be on the same Wi-Fi network. If they can't see each other (campus Wi-Fi often blocks this), use a tunnel:

```sh
npm run mobile -- --tunnel
```

## Tests, lint, types, formatting

```sh
npm test               # every workspace's tests (currently packages/ledger)
npm run lint           # ESLint across the repo
npm run typecheck      # tsc in every workspace
npm run format         # Prettier, write
npm run format:check   # Prettier, check only
```

Run the ledger tests in watch mode with `npm run test:watch -w @spendly/ledger`.

## Local Supabase

Needs Docker running. The first start downloads several images and takes a few minutes.

```sh
npm run db:start    # npx supabase start
npm run db:status   # URLs and keys for the local stack
npm run db:stop     # npx supabase stop
```

Local services:

| Service                       | URL                                                     |
| ----------------------------- | ------------------------------------------------------- |
| API                           | http://127.0.0.1:54321                                  |
| Database                      | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio                        | http://127.0.0.1:54323                                  |
| Mailpit (catches auth emails) | http://127.0.0.1:54324                                  |

To reach the local API from your phone, use your computer's LAN IP instead of `127.0.0.1`.

## Hosted Supabase

One-time setup:

1. Create a project at https://supabase.com/dashboard (pick a region near your users and save the database password).
2. Log in and link this repo to it:

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

   The project ref is the ID in the dashboard URL (`https://supabase.com/dashboard/project/<project-ref>`).

Later steps push migrations with `npx supabase db push` and set Edge Function secrets with `npx supabase secrets set --env-file supabase/functions/.env`.
