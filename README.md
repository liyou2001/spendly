# Spendly

A budgeting app for college students that handles shared money correctly: your share of a split purchase counts in your budget, what roommates owe you is tracked separately, and repayments settle debts instead of counting as income.

The build plan is in [docs/PLAN.md](docs/PLAN.md). Project rules for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Repo layout

```
apps/mobile          Expo app (Expo Router, TypeScript)
  src/app            routes: sign-in, (tabs)/ Home, Budget, People, Me, and the add-expense modal
  src/components     shared UI (Screen, KeyBlock, ListRow, Button, Tag, Avatar, ProgressBar, Money, ...)
  src/lib            Supabase client, encrypted session storage, session context
  src/theme.ts       design tokens (colors, Hanken Grotesk, type, spacing, radii)
apps/pay             payment page people open from a private link (Vite + React), deployed to Vercel
packages/ledger      pure TypeScript money and split math (Vitest)
supabase/            Supabase config, migrations, Edge Functions, database tests
docs/                build plan and exported designs
```

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

`.env.example` lists every variable, grouped by where it goes and which step first needs it. Real `.env` files are git-ignored. The app needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see [Sign in on your phone](#sign-in-on-your-phone)); the rest can stay blank until their step.

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

### Sign in on your phone

The app signs in with a 6-digit code sent by email. Against local Supabase, the emails never leave your computer: they land in Mailpit at http://127.0.0.1:54324 (see [Development emails](#development-emails-sign-in-codes)).

1. Start local Supabase (`npm run db:start`) if it isn't running.
2. Give the app the local key. Copy `PUBLISHABLE_KEY` from `npm run db:status` into `apps/mobile/.env`, and leave the URL blank:

   ```sh
   EXPO_PUBLIC_SUPABASE_URL=
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   With the URL blank, the app finds local Supabase by itself: it uses the same computer address your phone used to load the app, on port 54321. Nothing to update when your Wi-Fi address changes. Set the URL only for a hosted project (`https://<project-ref>.supabase.co`). Restart `npm run mobile` after editing `.env`; values are read when the bundle is built.

3. Open the app, enter an email and tap **Email me a code**. Use `leo@example.com` to sign in as the seed user, or any other address to create a new account (it gets a profile, a Personal group and the default categories).
4. On your computer, open Mailpit at http://127.0.0.1:54324, open the newest "Your Spendly sign-in code" email and type the code into the app. It signs in as soon as all 6 digits are in.

The session is saved on the phone (encrypted, with the key in the iOS Keychain / Android Keystore), so the app stays signed in after you close it. **Me → Sign out** signs out.

Settings live in the **Me** tab: **Profile & payments** (your name and Venmo/PayPal/Cash App usernames) and **Categories** (add, rename or delete the categories your spending is sorted into).

Your phone has to reach your computer directly, for the app bundle and for local Supabase. Some networks block that, including many campus and office Wi-Fi networks, and some VPN or security software on the computer. If the app won't load or can't send a code, connect your computer to your phone's personal hotspot (or your home Wi-Fi), or use a hosted Supabase project. The tunnel (`--tunnel`) only carries the app bundle, not Supabase.

### Troubleshooting

| Message                                                | Fix                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| "No usable data found" (iPhone Camera)                 | Install Expo Go first; the Camera app only opens `exp://` links once it's installed.                                               |
| "You need to be signed in to Expo Go"                  | Log in on the computer (`npx expo login --browser`) and in Expo Go with the same account.                                          |
| "Project is incompatible with this version of Expo Go" | Your Expo Go supports a different SDK than the project. Update Expo Go, or move the project to its SDK.                            |
| App won't load, or the connection times out            | Phone and computer can't reach each other on this network. Use your phone's hotspot, or `--tunnel` plus a hosted Supabase project. |
| "Missing the Supabase URL..." on launch                | Create `apps/mobile/.env` with the publishable key (see [Sign in on your phone](#sign-in-on-your-phone)) and restart.              |
| "Network request failed" when sending the code         | The phone can't reach Supabase. Check `npm run db:start` is up and the network allows it (see above).                              |
| Signed out after `npm run db:reset`                    | Expected: the reset deletes every session. Sign in again.                                                                          |

## Tests, lint, types, formatting

```sh
npm test               # every workspace's tests (ledger, app, payment page)
npm run test:functions # Edge Function tests (Deno), against local Supabase with functions served
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
npm run db:reset    # rebuild the database from migrations, then load supabase/seed.sql
npm run db:test     # pgTAP tests in supabase/tests
npm run db:types    # regenerate packages/db/src/database.types.ts after a schema change
```

The schema is in `supabase/migrations/` and drawn in [DATA_MODEL.md](DATA_MODEL.md). Change it by adding a new migration (`npx supabase migration new <name>`), never by editing one that's already been pushed, then run `db:reset`, `db:test` and `db:types`.

The seed loads the plan's Costco example. Leo has an account (`leo@example.com`, password `password123`); Jeff and Maya are name-only. Local auth emails, including sign-in codes, show up in Mailpit.

The sign-in emails come from `supabase/templates/` (set up in `supabase/config.toml`) and show the one-time code instead of a magic link. After changing `config.toml` or a template, restart the stack with `npm run db:stop && npm run db:start`.

Local services:

| Service                       | URL                                                     |
| ----------------------------- | ------------------------------------------------------- |
| API                           | http://127.0.0.1:54321                                  |
| Database                      | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio                        | http://127.0.0.1:54323                                  |
| Mailpit (catches auth emails) | http://127.0.0.1:54324                                  |

The app reaches the local API at your computer's network address automatically (see [Sign in on your phone](#sign-in-on-your-phone)); `127.0.0.1` only works on the computer itself.

### Development emails (sign-in codes)

Local Supabase never sends real email. Every email it sends, to any address, lands in **Mailpit**, a test inbox on your computer:

**http://127.0.0.1:54324**

Open it in your computer's browser while local Supabase is running. Sign-in codes arrive as "Your Spendly sign-in code" (or "Your Spendly sign-up code" for a new address), newest at the top. Nothing reaches your real inbox, so you can sign in as any address, including made-up ones like `jeff@example.com`.

`npm run db:reset` deletes every account except the seeded `leo@example.com`. If you signed in with your own address, sign in again afterwards to get a fresh account.

## Payment page and Edge Functions

People without the app open a private link to see their share, pay with Venmo, PayPal or Cash App, and say "I paid". Request payment on a person's screen makes the link.

Locally, run three things (each in its own terminal):

```sh
npm run db:start                  # if it isn't running
npx supabase functions serve      # Edge Functions in supabase/functions, with hot reload
npm run pay                       # the page at http://<your computer's address>:5173
```

The app builds links to the page's dev server on the same computer as Expo, so a link texted from your phone opens on your phone over Wi-Fi. Set `EXPO_PUBLIC_PAY_PAGE_URL` once the page is deployed.

`npm run test:functions` needs [Deno](https://deno.com) (`curl -fsSL https://deno.land/install.sh | sh`) and the functions being served.

### Deploying the page to Vercel

1. Import the repo at https://vercel.com/new and set **Root Directory** to `apps/pay`. `apps/pay/vercel.json` sets the build.
2. Add the environment variable `VITE_SUPABASE_URL` (your hosted project's URL) and optionally `VITE_GET_APP_URL`.
3. Deploy the functions with `npx supabase functions deploy`, and put the page's URL in the app's `EXPO_PUBLIC_PAY_PAGE_URL`.

### Receipt scanning

Scanning reads a receipt photo with Gemini or Claude and fills in Add expense. The API key stays on the server. Put one of these in `supabase/functions/.env` (see `.env.example`):

- **Gemini (free tier, for development):** `GEMINI_API_KEY` from https://aistudio.google.com. It reads with Gemini 3.5 Flash-Lite, then 3.8 Flash if the lines don't add up. On the free tier Google may use what you send to improve its products, so scan only your own receipts with it.
- **Claude (the plan's choice):** `ANTHROPIC_API_KEY` from https://console.anthropic.com (needs API credits; a Claude subscription doesn't include them). It reads with Haiku 5.5, then Sonnet 5.5.

With both set, Gemini is used unless `RECEIPT_PROVIDER=claude`. `RECEIPT_SCANS_PER_MONTH` sets the monthly limit per person (default 50). `functions serve` reloads when the file changes. Hosted: `npx supabase secrets set --env-file supabase/functions/.env`.

Without a key, scanning says it isn't set up yet and you enter the expense by hand. Photos are deleted as soon as they've been read; only the draft is kept, in `receipt_extractions`.

To measure accuracy, put about 20 real receipt photos (`.jpg` or `.png`) in `receipts/` (git-ignored). Optionally add `<name>.json` next to a photo with what's right, e.g. `{"total_cents": 14000, "items": 9}`. Then run `npm run receipts:accuracy`. It uses the same key and provider, and reports per model how often the lines add up, the total is right and the item count is right.

### Push notifications

Pushes ("Jeff says they paid you $15.00") need the app linked to an EAS project, once:

```sh
cd apps/mobile
npx eas-cli@latest init   # adds extra.eas.projectId to app.json
```

Until then the app skips push registration. Expo Go on iOS receives pushes; on Android, pushes need a development build (`eas build --profile development`).

## Hosted Supabase

One-time setup:

1. Create a project at https://supabase.com/dashboard (pick a region near your users and save the database password).
2. Log in and link this repo to it:

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

   The project ref is the ID in the dashboard URL (`https://supabase.com/dashboard/project/<project-ref>`).

For email sign-in, paste `supabase/templates/magic_link.html` and `confirmation.html` into the dashboard's **Authentication → Emails** templates (the hosted defaults send only a link, and the app needs the `{{ .Token }}` code). The built-in email sender allows only a few emails per hour, which is fine for testing.

Later steps push migrations with `npx supabase db push` and set Edge Function secrets with `npx supabase secrets set --env-file supabase/functions/.env`.
