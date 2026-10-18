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
- **Expo Go** on your phone (App Store / Google Play) and a free Expo account. See [Run the app](#run-the-app).

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

The app runs in Expo Go during development. It uses **Expo SDK 57**, so your Expo Go must support SDK 57 (Expo Go's settings tab shows which SDK it supports).

### One-time Expo setup

Expo Go needs you signed in to the same Expo account on your computer and your phone.

1. Create a free account at https://expo.dev/signup (signing up with GitHub works).
2. Log in on your computer. If your account uses GitHub, add `--browser`, since it has no password:

   ```sh
   cd apps/mobile
   npx expo login --browser
   npx expo whoami        # should print your username
   ```

3. In Expo Go on your phone, tap the profile icon, then sign in with the same account.

### Start it

From the repo root:

```sh
nvm use
npm run mobile
```

This starts the Expo dev server and prints a QR code. Open the project on your phone in one of these ways:

- **Development servers list:** when you're signed in on both devices, the project appears on Expo Go's home screen. Tap it.
- **iPhone:** scan the QR code with the Camera app.
- **Android:** scan the QR code from inside Expo Go (not the Camera app).
- **By hand:** in Expo Go, tap **Enter URL manually** and type the `exp://...` address printed under the QR code.

Your phone and computer must be on the same Wi-Fi network. If they can't see each other (campus Wi-Fi often blocks this), use a tunnel:

```sh
npm run mobile -- --tunnel
```

Press `w` in the dev server to open the web version in a browser instead.

### Troubleshooting

| Message                                                | Fix                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| "No usable data found" (iPhone Camera)                 | Install Expo Go first; the Camera app only opens `exp://` links once it's installed.                    |
| "You need to be signed in to Expo Go"                  | Log in on the computer (`npx expo login --browser`) and in Expo Go with the same account.               |
| "Project is incompatible with this version of Expo Go" | Your Expo Go supports a different SDK than the project. Update Expo Go, or move the project to its SDK. |
| Connection times out                                   | Phone and computer can't reach each other. Use `npm run mobile -- --tunnel`.                            |

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
