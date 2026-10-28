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
apps/email-worker    Cloudflare Email Worker: passes forwarded receipts to the inbound-email function
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
cp .env.example apps/mobile/.env.dev      # then delete the lines that aren't for the app
cp .env.example supabase/functions/.env   # then delete the lines that aren't for functions
```

`.env.example` lists every variable, grouped by where it goes and which step first needs it. Real `.env` files are git-ignored. The app reads `apps/mobile/.env.dev` for local Supabase (`npm run mobile`) and `apps/mobile/.env.prod` for the hosted project (`npm run mobile:prod`; see [Switching between local and hosted](#switching-between-local-and-hosted)). It needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see [Sign in on your phone](#sign-in-on-your-phone)); the rest can stay blank until their step.

## Run the app

The app runs in Expo Go during development. It uses **Expo SDK 58**, so your Expo Go must support SDK 58 (Expo Go's settings tab shows which SDK it supports). Expo Go on an iPhone only runs the newest SDK, so when it updates, upgrade the project too: `npx expo install expo@^<new>.0.0 --fix` from `apps/mobile`, then `npx expo-doctor`.

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

Press `w` in the dev server to open the web version in a browser instead (or start with `npm run mobile -- --web`). Start the app with these scripts rather than plain `npx expo start`, which doesn't load `.env.dev`.

### Sign in on your phone

The app signs in with a 6-digit code sent by email. Against local Supabase, the emails never leave your computer: they land in Mailpit at http://127.0.0.1:54324 (see [Development emails](#development-emails-sign-in-codes)).

1. Start local Supabase (`npm run db:start`) if it isn't running.
2. Give the app the local key. Copy `PUBLISHABLE_KEY` from `npm run db:status` into `apps/mobile/.env.dev`, and leave the URL blank:

   ```sh
   EXPO_PUBLIC_SUPABASE_URL=
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   With the URL blank, the app finds local Supabase by itself: it uses the same computer address your phone used to load the app, on port 54321. Nothing to update when your Wi-Fi address changes. Set the URL only for a hosted project (`https://<project-ref>.supabase.co`). Restart `npm run mobile` after editing `.env.dev`; values are read when the bundle is built.

3. Open the app, enter an email and tap **Email me a code**. Use `leo@example.com` to sign in as the seed user, or any other address to create a new account (it gets a profile, a Personal group and the default categories).
4. On your computer, open Mailpit at http://127.0.0.1:54324, open the newest "Your Spendly sign-in code" email and type the code into the app. It signs in as soon as all 6 digits are in.

The session is saved on the phone (encrypted, with the key in the iOS Keychain / Android Keystore), so the app stays signed in after you close it. **Me → Sign out** signs out.

Settings live in the **Me** tab: **Profile & payments** (your name and Venmo/PayPal/Cash App usernames) and **Categories** (add, rename or delete the categories your spending is sorted into).

Your phone has to reach your computer directly, for the app bundle and for local Supabase. Some networks block that, including many campus and office Wi-Fi networks, and some VPN or security software on the computer. If the app won't load or can't send a code, connect your computer to your phone's personal hotspot (or your home Wi-Fi), or use a hosted Supabase project. The tunnel (`--tunnel`) only carries the app bundle, not Supabase.

### Troubleshooting

| Message                                                | Fix                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "No usable data found" (iPhone Camera)                 | Install Expo Go first; the Camera app only opens `exp://` links once it's installed.                                                      |
| "You need to be signed in to Expo Go"                  | Log in on the computer (`npx expo login --browser`) and in Expo Go with the same account.                                                 |
| "Project is incompatible with this version of Expo Go" | Your Expo Go supports a different SDK than the project. Update Expo Go, or move the project to its SDK.                                   |
| App won't load, or the connection times out            | Phone and computer can't reach each other on this network. Use your phone's hotspot, or `--tunnel` plus a hosted Supabase project.        |
| "Missing the Supabase URL..." on launch                | Start with `npm run mobile`, and put the publishable key in `apps/mobile/.env.dev` (see [Sign in on your phone](#sign-in-on-your-phone)). |
| "Network request failed" when sending the code         | The phone can't reach Supabase. Check `npm run db:start` is up and the network allows it (see above).                                     |
| Signed out after `npm run db:reset`                    | Expected: the reset deletes every session. Sign in again.                                                                                 |

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

### Sign-in codes to real inboxes

For a demo, local Supabase can send sign-in codes to people's real inboxes through an SMTP server. Put these in `supabase/.env` (git-ignored; the Supabase CLI reads it), then restart with `npm run db:stop && npm run db:start`:

```sh
SUPABASE_AUTH_EMAIL_SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM=you@gmail.com
```

- **Gmail** (no domain needed): turn on 2-Step Verification, create an app password at https://myaccount.google.com/apppasswords and use it as `SMTP_PASS`. `SMTP_USER` and `SMTP_FROM` are your Gmail address. Gmail sends up to about 500 a day. Codes may land in spam the first time.
- **Resend**: `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS` is your API key, and `SMTP_FROM` is an address on a domain verified in Resend. Without a domain, `onboarding@resend.dev` only delivers to your own Resend account's address.

Codes then stop arriving in Mailpit. Supabase allows 30 emails an hour (`[auth.rate_limit]` in `supabase/config.toml`). To go back to Mailpit, set `SUPABASE_AUTH_EMAIL_SMTP_ENABLED=false` and restart.

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

With both set, Gemini is used unless `RECEIPT_PROVIDER=claude`. `RECEIPT_SCANS_PER_MONTH` sets the monthly limit per person, photos and forwarded emails together (default 40). Add expense shows how many are left under the scan buttons, from the `scan-allowance` function; deploy it with the others. `functions serve` reloads when the file changes. Hosted: `npx supabase secrets set --env-file supabase/functions/.env`.

Without a key, scanning says it isn't set up yet and you enter the expense by hand. A photo that reads as a receipt is kept until the expense is saved: with "Keep the photo" on (the default), it's attached to the expense and everyone in the group can see it; otherwise it's deleted. Unreadable photos are deleted right away, and the daily `clean-receipts` job (it uses the same Vault secrets as reminders, below) deletes photos no expense uses after a day.

To measure accuracy, put about 20 real receipt photos (`.jpg` or `.png`) in `receipts/` (git-ignored). Optionally add `<name>.json` next to a photo with what's right, e.g. `{"total_cents": 14000, "items": 9}`. Then run `npm run receipts:accuracy`. It uses the same key and provider, and reports per model how often the lines add up, the total is right and the item count is right.

### Forwarded email receipts

Everyone forwards receipts to one address. Cloudflare Email Routing receives it and hands it to a small Worker (`apps/email-worker`), which posts the raw email to the `inbound-email` function. The sender's address says whose receipt it is: each person's sign-in email counts automatically, and they can add more in Me → Forward receipts (each confirmed with an emailed code). Gmail filters that forward automatically work too: Gmail sends them with the forwarding account as the envelope sender, which Cloudflare's SPF check covers.

An address is trusted only when SPF, DKIM or DMARC passed for its own domain, and only by checks we can prove: DKIM signatures verified in the function against DNS, and Cloudflare's own results, used only when Cloudflare's ARC seal on them verifies. Authentication headers inside the email are never read, since the sender could have written them. So a faked From line matches no one, and gets no reply. The email itself is never stored.

A forwarded receipt is read like a scanned one (a PDF or photo attachment, or the email text) and shows up under Needs you on Home, ready to split. Duplicates are skipped. Unknown senders get one reply a day explaining how to add their address.

Locally (no domain needed; Cloudflare can't reach your computer):

1. Put any long random string in `supabase/functions/.env` as `INBOUND_SECRET`. `functions serve` reloads.
2. `npm run email:test -- you@example.com` posts a sample Amazon order "from" that address, as the Worker would. Use an address on your account. A few seconds later it's under Needs you. Locally, the script's `X-Test-Sender` header stands in for Cloudflare's check; hosted, it's ignored.
3. Emails the functions send (codes for added addresses, the reply to unknown senders) land in Mailpit at http://127.0.0.1:54324. Try `npm run email:test -- stranger@example.com` to see the reply.

Hosted (needs a domain; see the launch checklist in `NEXT_STEPS.md`):

1. **Receiving:** add the domain to Cloudflare and turn on Email Routing. Deploy the Worker: `npx wrangler@4.147.0 login`, then `npx wrangler@4.147.0 secret put INBOUND_URL` (`https://<project-ref>.supabase.co/functions/v1/inbound-email`) and `INBOUND_SECRET`, run from `apps/email-worker`, then `npm run deploy --workspace email-worker`. In Email Routing, send the receipts address to the Worker. Set `RECEIPTS_EMAIL_ADDRESS` (functions) and `EXPO_PUBLIC_RECEIPTS_EMAIL` (app) to it.
2. **Sending:** verify the domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM` in the functions' secrets. Put the same Resend SMTP details in Supabase Auth's SMTP settings so sign-in codes come from your domain too.
3. Put `INBOUND_SECRET` in the functions' secrets and deploy the functions.

### Push notifications

Pushes ("Jeff says they paid you $15.00") need the app linked to an EAS project, once:

```sh
cd apps/mobile
npx eas-cli@latest init   # adds extra.eas.projectId to app.json
```

Until then the app skips push registration. Expo Go on iOS receives pushes; on Android, pushes need a development build (`eas build --profile development`).

### Reminders and texts

Every hour, `pg_cron` asks the `send-reminders` function to remind about debts unpaid for more than 3 days. Someone with the app gets a push. Someone without it who ticked "Text me about payments" on their payment link gets a text, with a fresh link. Anyone else is left to the person they owe, who gets a push to remind them from their own phone. A debt is reminded about at most once every 3 days, never while an "I paid" waits to be confirmed, and only between 9am and 9pm in the time zone of the person owed (the app saves each phone's).

Every text goes through `sendText()` (`supabase/functions/_shared/text.ts`). It only texts a number whose owner opted in themselves, never at night, starts each text with "Spendly:", and adds "Reply STOP to opt out." to the first one. Replying STOP reaches `sms-inbound`, which withdraws the consent. With `SMS_PROVIDER=log` (the default) nothing is sent: texts are saved to `outbound_messages` as `logged`.

To turn reminders on locally (or hosted, with your project's URL instead of `http://kong:8000`):

1. Put any long random string in `supabase/functions/.env` as `CRON_SECRET`. `functions serve` reloads.
2. Give the database the same secret and where to call, once (Studio's SQL editor, or `psql`):

   ```sql
   select vault.create_secret('http://kong:8000', 'project_url');
   select vault.create_secret('<the same CRON_SECRET>', 'cron_secret');
   ```

3. To send now instead of waiting for the hour: `select private.request_reminders();`. Pushes need a phone registered for them; logged texts show in `outbound_messages`.

To really send texts, set `SMS_PROVIDER` to `twilio` or `telnyx` with that provider's settings (`.env.example`), and point the number's incoming-message webhook at `https://<project-ref>.supabase.co/functions/v1/sms-inbound`. For Twilio, also set `SMS_WEBHOOK_URL` to exactly that URL, since Twilio's signature covers it. Register the texting brand and campaign (10DLC) first; carriers block unregistered texts.

## Hosted Supabase

One-time setup:

1. Create a project at https://supabase.com/dashboard (pick a region near your users and save the database password).
2. Log in and link this repo to it:

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

   The project ref is the ID in the dashboard URL (`https://supabase.com/dashboard/project/<project-ref>`).

For email sign-in, paste `supabase/templates/magic_link.html` and `confirmation.html` into the dashboard's **Authentication → Emails** templates (the hosted defaults send only a link, and the app needs the `{{ .Token }}` code). Then set **Authentication → Sign In / Providers → Email → Email OTP Length** to `6`: new hosted projects send 8-digit codes, and the app takes 6. The built-in email sender only delivers to members of your Supabase organization, a few emails an hour. To send codes to anyone, set up custom SMTP under **Authentication → Emails → SMTP Settings** with the same values as [Sign-in codes to real inboxes](#sign-in-codes-to-real-inboxes).

### Web demo link

To let friends try the app without the App Store, publish the web version on Vercel. It talks to the hosted project (`apps/mobile/.env.prod`):

Needs Node 24 (`nvm use`; the Vercel CLI refuses Node 20). The first time, log in and link the project from the repo root:

```sh
npx vercel login
npx vercel link
```

Then, and after every change you want to publish:

```sh
npm run web:deploy
```

This builds the site into `apps/mobile/dist`, packs it as a prebuilt deployment in `.vercel/output` (with the rules that send every path to `index.html`, so deep links and refreshes work), and uploads exactly that. The link is `https://<name>.vercel.app`. To check the build on your computer first: `npm run build:web:prod --workspace mobile`, then `npx expo serve` from `apps/mobile`.

- Friends sign in with their own email, so codes must reach any inbox: the hosted project needs SMTP from a verified domain (see above).
- Push notifications and texting from the phone don't work on the web.
- Payment links need the payment page deployed too ([Deploying the page to Vercel](#deploying-the-page-to-vercel)) and its URL in `EXPO_PUBLIC_PAY_PAGE_URL` in `.env.prod`. Without it, the app doesn't offer links.

### Switching between local and hosted

Dev runs against local Supabase, prod against the hosted project. Each has its own git-ignored env file and a script that loads it:

|                           | Dev (local Supabase)           | Prod (hosted project)               |
| ------------------------- | ------------------------------ | ----------------------------------- |
| App (`apps/mobile`)       | `.env.dev` → `npm run mobile`  | `.env.prod` → `npm run mobile:prod` |
| Payment page (`apps/pay`) | no file needed → `npm run pay` | `.env.prod` → `npm run pay:prod`    |

To switch, stop the dev server (Ctrl+C) and start it again with the other script, from the repo root:

| Where           | Dev                       | Prod                           |
| --------------- | ------------------------- | ------------------------------ |
| Phone (Expo Go) | `npm run mobile`          | `npm run mobile:prod`          |
| Web browser     | `npm run mobile -- --web` | `npm run mobile:prod -- --web` |

For dev, start local Supabase first (`npm run db:start`) if it isn't running.

The web version opens at http://localhost:8081. You can also press `w` in a running dev server. Other Expo options go after `--` the same way, e.g. `npm run mobile -- --tunnel`.

- **Restart the dev server to switch.** The values are read when it starts, so reloading the page or the app isn't enough.
- **You'll be signed out when you switch.** Local and hosted have separate accounts, so you sign in again on each.
- **Codes go to different places.** In dev they land in Mailpit at http://127.0.0.1:54324. In prod they go to real inboxes through the SMTP settings in the Supabase dashboard.
- **Payment links:** if you're testing them, run the matching page too: `npm run pay` with dev, `npm run pay:prod` with prod.
- **Don't use plain `npx expo start`.** It loads neither file, and the app stops with "Missing the Supabase URL".

`apps/mobile/.env.prod` has the hosted URL and its publishable key (**Project Settings → API Keys**, starts with `sb_publishable_`). Don't use the local key from `npm run db:status`; the hosted project rejects it with "Invalid API key". `apps/pay/.env.prod` has `VITE_SUPABASE_URL`.

Later steps push migrations with `npx supabase db push` and set Edge Function secrets with `npx supabase secrets set --env-file supabase/functions/.env`.
