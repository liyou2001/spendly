# Finance app build plan

A step-by-step plan for building the app with Claude Code. Each step is a working milestone you can test on your phone before moving on.

## How to use this plan

1. Put this file in the repo at `docs/PLAN.md`.
2. Start each Claude Code session with: "Read docs/PLAN.md. Do Step N only."
3. When the agent finishes a step, check every item under **Done when**: run the tests and try the feature on your phone. Commit, then start the next step.
4. Each step lists what **not** to build yet. Don't let the agent get ahead; later steps depend on earlier ones being solid.
5. Step 1 creates a `CLAUDE.md` from the Project context section below, so Claude Code loads it in every session.

Optional: export the screens from the design canvas as images into `docs/design/` so the agent can look at them.

---

## Project context

### What we're building

A budgeting app for college students that gets shared money right. Users track their own spending and split shared purchases with roommates. Your share counts in your budget, what others owe you is tracked separately, and repayments settle debts instead of counting as income.

### The example used throughout

Leo pays $140.00 at Costco:

| Items                                                         | Who                            | Amount               |
| ------------------------------------------------------------- | ------------------------------ | -------------------- |
| Protein powder $47.99, graphic tee $12.99, granola bars $7.02 | Leo only                       | $68.00               |
| Paper towels $22.99, dish soap $11.49, trash bags $10.52      | Leo, Jeff, Maya (split 3 ways) | $45.00 ($15.00 each) |
| Oat milk $12.49, hummus $8.99, veggie chips $5.52             | Maya only                      | $27.00               |

Result: Leo's spending is $83.00 (Groceries). Jeff owes Leo $15.00. Maya owes Leo $42.00.

### MVP features

- Personal budget with categories and monthly limits.
- Groups with participants, including people who don't have accounts.
- Splitting an expense by item, with shared items split among a subset of people.
- A who-owes-whom ledger calculated from history.
- Repayments: recorded by the person who got paid (counts immediately), or claimed by the payer and confirmed by the recipient.
- Privacy: each person sees only their own share, never the payer's total or other people's items.

### Out of scope for now

Bank sync, moving money in the app, automatic repayment detection, advanced budgeting, CSV import.

### Tech stack

| Part                                      | Choice                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Mobile app                                | Expo (React Native) + TypeScript, Expo Router                                                                                     |
| Payment page (for people without the app) | Static web page on Vercel. Expo Router's web output, or a small separate Vite + React app if that's simpler. No Vercel functions. |
| Database                                  | Supabase Postgres with row-level security                                                                                         |
| Login                                     | Supabase Auth (email one-time code for now; phone later)                                                                          |
| File storage                              | Supabase Storage (private receipt photos)                                                                                         |
| Server code                               | Supabase Edge Functions (Deno, standard web APIs)                                                                                 |
| Receipt reading                           | Claude Haiku 5.5 (`claude-haiku-5-5`), retry on Claude Sonnet 5.5 (`claude-sonnet-5-5`)                                           |
| Forwarded receipts                        | Postmark inbound email                                                                                                            |
| Texts                                     | Twilio or Telnyx at launch, behind one `sendText()` function                                                                      |
| Push notifications                        | Expo push                                                                                                                         |
| Error alerts                              | Sentry                                                                                                                            |
| Getting paid                              | Venmo, PayPal, Cash App payment links (no payment API)                                                                            |

### Repo layout

```
apps/mobile          Expo app
apps/pay             payment web page (if not built from the Expo app)
packages/ledger      pure TypeScript money and split math, no dependencies
supabase/migrations  database schema
supabase/functions   Edge Functions
supabase/tests       database tests
docs/PLAN.md         this file
docs/design/         exported screen images
```

Use npm or pnpm workspaces and follow Expo's monorepo guide.

### Rules (apply to every step)

1. **Money is whole cents.** Store and calculate amounts as integers (1500, not 15.00). Never use floating point for money. Format only for display.
2. **History is append-only.** Never update or delete expenses, items, shares or payments. A correction voids the old expense (`voided_at`) and adds a replacement (`replaces_expense_id`). Payment claims change status, recording who and when.
3. **Shares always add up.** An expense's shares sum exactly to its total. Leftover cents go to participants in a fixed order (for example, sorted by participant id), so the same input always gives the same result.
4. **Balances are calculated, not stored by hand.** They come from shares and confirmed payments.
5. **Each person sees only their own share.** Enforce this in the database and Edge Functions, not just the UI.
6. **AI output is only a draft.** Code checks the math, and the user reviews before anything enters the ledger. The AI never does money math.
7. **Repayments never count as income or spending** in budgets.
8. **Texting needs the recipient's own consent.** Never text a number that hasn't opted in itself. Keep proof of consent and honor STOP. All texting goes through `sendText()`.
9. **Secrets stay on the server.** The Claude, Postmark and Twilio keys live in Supabase secrets, never in the app.
10. **Every money calculation has tests.**

### Design

- **Colors:** white `#FFFFFF` background. Pale coral `#F8DFD9` for the one key block per screen, the active tab, "You" tags, avatars and open dropdowns. Coral `#E58C76` for primary buttons, selected chips, the + (add expense) button, progress bars and attention dots, with ink text and icons on it (ink is 6.1:1; white would be only 2.5:1). Bars and dots always sit beside text that says the same thing. Ink `#2B2420` for text. Muted `#6B5F57` for secondary text. Dividers `#F1E7DF`. Control borders `#E2D5CB`.
- **Type:** Hanken Grotesk, weights 300/400/500/600. Big numbers 52px at weight 300, letter-spacing -0.03em, tabular figures. Screen titles 24–28px/500. Section headings 15px/600. Body 15–16px/400. Small text 13–14px in muted.
- **Layout:** 24px side margins, about 28px between sections. Lists separated by thin dividers, not cards. Key block corner radius 24px. Buttons radius 14px, at least 44px tall. Tags fully rounded.
- **Tabs:** Home, Budget, + (orange circle, adds an expense), People, Me.
- Stroke icons, no emoji. Text contrast at least 4.5:1.

---

## Data model

Every expense belongs to a group. Each user gets an automatic "Personal" group containing only them, for expenses that aren't shared.

| Table                 | Purpose                                | Key columns                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`            | One per user                           | `id` (auth user), `display_name`, `venmo_username`, `paypal_username`, `cashapp_tag`                                                                                                                                                                                          |
| `groups`              | Apartment, trip, Personal, quick split | `id`, `name`, `created_by`, `is_personal`, `is_one_off`                                                                                                                                                                                                                       |
| `participants`        | People in a group; may have no account | `id`, `group_id`, `display_name`, `user_id` (nullable), `phone` (nullable)                                                                                                                                                                                                    |
| `categories`          | Budget categories per user             | `id`, `user_id`, `name` (defaults: Rent, Groceries, Dining, Transport, Fun, Other)                                                                                                                                                                                            |
| `budgets`             | Monthly limit per category             | `user_id`, `category_id`, `month` (first day of month), `amount_cents`                                                                                                                                                                                                        |
| `expenses`            | One purchase                           | `id`, `group_id`, `paid_by` (participant), `merchant`, `expense_date`, `total_cents`, `category_id` (payer's), `source` (manual, photo, email), `created_by`, `voided_at`, `voided_by`, `replaces_expense_id`                                                                 |
| `expense_items`       | Lines on a receipt                     | `id`, `expense_id`, `name`, `amount_cents`, `kind` (item, tax, tip, discount), `position`                                                                                                                                                                                     |
| `item_assignments`    | Who an item is for                     | `item_id`, `participant_id` (several rows = split equally among them)                                                                                                                                                                                                         |
| `shares`              | Each person's part of an expense       | `expense_id`, `participant_id`, `amount_cents`, `category_override_id`                                                                                                                                                                                                        |
| `payments`            | Repayments and forgiven debts          | `id`, `group_id`, `from_participant`, `to_participant`, `amount_cents`, `kind` (payment, forgiveness), `expense_id` (required for forgiveness, null for payments), `status` (claimed, confirmed, rejected), `method`, `recorded_by`, `decided_by`, `decided_at`, `created_at` |
| `share_links`         | Private links for the payment page     | `id`, `participant_id`, `token_hash`, `created_at`, `revoked_at`                                                                                                                                                                                                              |
| `sms_consents`        | Proof someone agreed to texts          | `phone`, `participant_id`, `user_id`, `consented_at`, `source`, `revoked_at`                                                                                                                                                                                                  |
| `outbound_messages`   | Every text sent or logged              | `to_phone`, `body`, `status` (logged, sent, failed), `provider_id`, `error`, `created_at`                                                                                                                                                                                     |
| `receipt_extractions` | Each AI reading attempt                | `id`, `user_id`, `source`, `storage_path`, `model`, `status`, `result`, `error`, `created_at`                                                                                                                                                                                 |
| `inbound_emails`      | Each forwarded email                   | `id`, `provider_message_id` (unique), `from_address`, `user_id`, `status`, `error`, `received_at`                                                                                                                                                                             |
| `verified_emails`     | Addresses a user forwards from         | `user_id`, `email`, `verified_at`                                                                                                                                                                                                                                             |
| `push_tokens`         | Expo push tokens                       | `user_id`, `token`                                                                                                                                                                                                                                                            |

Database functions (called with `supabase.rpc`):

- `save_expense(...)`: inserts the expense, items, assignments and shares in one transaction. Rejects the save if shares don't sum to the total.
- `void_expense(id)`: marks an expense voided; never deletes it.
- `balances()`: for each pair of participants in a group, the shares owed to the payer minus confirmed payments and forgiveness.
- `my_spending()`: for each user, category and month, the sum of their own shares plus any debts they forgave. A share's category is the user's `category_override_id` if set; otherwise the payer's own share uses the expense's category and anyone else's is uncategorized. Must match `spendingByCategory` in `packages/ledger`.
- `get_my_shares()`: what an account holder sees of expenses someone else paid: only their items and their amount.

Privacy rules:

- Full expense rows, items and shares are readable only by the payer.
- Other account holders read only through `get_my_shares()`.
- People without accounts read only through the `get-share` Edge Function with a valid link token.
- Nothing is readable without signing in.

Splitting rules:

- An item assigned to several people is split equally among them. Items for exactly the same people are added up first and split once, so the Costco household items give exactly $15.00 each.
- Tax, tip and discounts are split in proportion to each person's item subtotal.
- Leftover cents follow the fixed order from Rule 3. For even splits that's participant id order. For proportional splits the spare cents go to the largest remainders, ties broken by participant id.
- Forgiving a debt adds a `forgiveness` payment tied to one expense (`expense_id`); only that expense's payer can forgive. The balance drops, and the forgiven amount becomes the forgiver's own spending in that expense's category and month. Forgiveness on a voided expense is ignored.

---

## Step 1: Repo and project setup

**Goal:** an empty project that runs.

**Build:**

- The repo layout above, with strict TypeScript, ESLint and Prettier.
- The Expo app with Expo Router, showing a placeholder screen and running in Expo Go on a real phone.
- `packages/ledger` with Vitest and one sample test.
- The Supabase CLI set up (`supabase init`) with the local stack running (`supabase start`, needs Docker). Create the hosted Supabase project and link it.
- `.env.example` listing every environment variable. Real `.env` files are git-ignored.
- `CLAUDE.md` at the repo root containing the Project context section of this plan.
- A README with how to run the app, the tests and local Supabase.

**Done when:**

- The app opens on your phone.
- The sample test passes.
- Local Supabase starts.
- `CLAUDE.md` exists.

**Not yet:** any features.

## Step 2: Ledger math

**Goal:** all money math as pure, tested functions in `packages/ledger`, with no UI or database.

**Build:**

- Parse user input ("$12.34", "12.34", "12") into cents, and format cents for display. Reject invalid input.
- `splitEvenly(totalCents, participantIds)` with deterministic leftover cents.
- `computeShares(expense)`: takes items (each assigned to one or more participants) plus tax, tip and discount lines, and returns each participant's share, summing exactly to the total.
- `computeBalances(expenses, payments)`: who owes whom, from shares and confirmed payments only. The payer of an expense is owed every other participant's share.
- `netBalances`: nets each pair. If Leo owes Maya $30.00 and Maya owes Leo $42.00, Maya owes Leo $12.00.
- `spendingByCategory(...)`: a user's own shares plus forgiven debts, by category and month.

**Tests (must include):**

- The Costco example gives Leo 8300, Jeff 1500, Maya 4200, summing to 14000.
- $10.00 split 3 ways gives 334, 333, 333 in a fixed order, the same every run.
- Tax split proportionally still sums exactly to the total.
- Jeff owes 4250 and makes a confirmed payment of 2000, so he owes 2250.
- A claimed but unconfirmed payment doesn't change the balance.
- A repayment doesn't change anyone's spending.
- Randomized test: random items and assignments always produce shares that sum to the total.

**Done when:** all tests pass and every exported function is tested.

**Not yet:** database, UI.

## Step 3: Database schema and privacy rules

**Goal:** the data model above, with privacy enforced by the database.

**Build:**

- Migrations for every table in the data model, with constraints: positive amounts (except discounts), allowed status values, unique `provider_message_id`.
- `save_expense`, `void_expense`, `balances`, `my_spending` and `get_my_shares`.
- Append-only enforcement: the app's database roles can't update or delete ledger rows.
- Row-level security policies matching the privacy rules.
- On signup, create the user's profile, Personal group and default categories.
- A seed script with the Costco example: Leo has an account, Jeff and Maya are name-only.
- Database tests with `supabase test db` (pgTAP).
- Generated TypeScript types (`supabase gen types`) checked into the repo.

**Done when:**

- `supabase db reset` applies the migrations and seed cleanly.
- Tests pass, covering at least:
  - The seed's balances are Jeff owes Leo 1500 and Maya owes Leo 4200.
  - A second user can't read Leo's personal items or the $140 total.
  - Signed-out requests read nothing.
  - `save_expense` rejects shares that don't sum to the total.
  - Ledger rows can't be updated or deleted.

**Not yet:** Edge Functions.

## Step 4: App shell, login, design tokens

**Goal:** a signed-in app with the tabs and the visual style, before any real data.

**Build:**

- A theme file with the design tokens, and Hanken Grotesk loaded.
- Shared components:
  - `Screen`, `KeyBlock` (the pale orange block) and `ListRow`.
  - `Button` (primary in ink, secondary outlined) and `Tag`.
  - `Avatar` (an initial in a circle), `ProgressBar` and `Money` (tabular figures).
- Tabs: Home, Budget, + (center, opens Add expense), People, Me. Placeholder content for now.
- Supabase Auth with an email one-time code. Phone login comes later because it needs a paid text provider. Supabase's built-in email has low rate limits, which is fine for testing.
- Me screen: display name, Venmo, PayPal and Cash App usernames, sign out. (Me is now a settings hub: Profile & payments and Categories are pages under it, and later steps add their settings there too.)
- The session stays signed in between app launches.

**Done when:**

- You can sign in with an email code on your phone.
- Tabs switch.
- The screens use the design tokens.
- Signing out works.

**Not yet:** real data.

## Step 5: Groups and splitting an expense

**Goal:** the core flow: enter the Costco receipt by hand and split it.

**Build:**

- Create a group and add participants by name, with an optional phone number.
- The Add expense screen, matching the "Split a receipt" design:
  - Merchant, date, who paid (default: you) and the category for your share.
  - Items typed in as name and amount, plus optional tax and tip lines.
  - The people in the group as chips, plus "Add person."
  - Each item's tag cycles through You, All, each person, or a custom subset.
  - A live summary: your share and its category, what each person owes, a privacy note, and a save button.
- Quick mode: just a total, split evenly or by amounts, with no items.
- Personal expenses go to the Personal group and are entirely yours.
- Saving uses `computeShares` from `packages/ledger` and the `save_expense` function.
- An expense detail screen, and voiding an expense with a confirmation step.

**Done when:**

- Entering the Costco receipt by hand shows your share $83.00 → Groceries, Jeff $15.00 and Maya $42.00, and saves.
- Reopening the expense shows the same numbers.
- Voiding it removes it from balances while keeping it in history.

**Not yet:** receipt scanning, payment page.

## Step 6: Balances, People tab, payment requests, recording payments

**Goal:** see who owes whom, ask for money, and record repayments.

**Build:**

- The People tab, matching the design:
  - A totals block (owed to you, you owe).
  - A section per group, with each person's net balance and a status line.
  - "Recently settled."
- A person detail screen listing the expenses and payments behind the balance.
- Request payment: opens Messages through `expo-sms` with the person's phone and a prefilled text, for example: "Hey Jeff, you owe $15.00 for the Costco household stuff (paper towels, dish soap, trash bags). Pay here: <Venmo link>". The Venmo link is `https://venmo.com/<username>?txn=pay&amount=15.00&note=Costco%2010%2F17&audience=private`. Keep the note vague. With no phone number, use the share sheet.
- "Jeff paid me" on the recipient's side: the amount (partial allowed) and method. It counts immediately.
- Between two account holders: the person who owes taps "Pay with Venmo," then "I paid," which creates a claim. The recipient sees "Got it" or "Didn't get it." Only "Got it" reduces the balance.
- Forgive a debt.
- Netting per pair.

**Done when:**

- With the seed data, People shows Jeff owes you $15.00 and Maya owes you $42.00.
- Request payment opens Messages with the text filled in.
- Recording "Jeff paid me $15.00" brings his balance to $0.00 and shows it under Recently settled.
- Jeff owes $42.50 and pays $20.00, so he still owes $22.50.
- You've tested the Venmo link on a real iPhone and a real Android phone, since the format isn't officially documented.

**Not yet:** push notifications, payment page, backend texts.

## Step 7: Budget and Home

**Goal:** the budgeting half, showing only your share of shared purchases.

**Build:**

- Set a monthly budget for each category. Categories themselves are added, renamed and deleted in Me → Categories (built after Step 5). Budgets carry forward from the month they're set until changed. Your share of someone else's expense can be filed under one of your categories from its expense screen.
- The Budget screen, matching the design:
  - A month switcher.
  - A key block: spent so far, the budget, a progress bar, and what's left with days to go.
  - A row per category with its bar, plus a note where a split changed the number ("Includes your $83 share of the $140 Costco trip").
  - A "Not counted as spending" section showing owed to you and you owe.
- The Home screen, matching the design:
  - A greeting and the month key block.
  - Owed to you and You owe rows.
  - "Needs you": claims to confirm and drafts to review.
- A first-run state on Home: "Add your first shared expense," not an empty budget.
- A full activity list, reachable from Budget.

**Done when:**

- With the seed data, Groceries shows $83, not $140.
- Recording Jeff's $15 repayment changes balances but not spending.
- Months switch correctly.
- A pending claim appears under Needs you.

**Not yet:** payment page, scanning.

## Step 8: Payment page, private links, push notifications

**Goal:** people without the app can see their share, pay, and say they paid.

**Build:**

- Private links: a random token per participant, with only its hash stored. Leo can revoke it from the person detail screen.
- Edge Functions, with rate limits:
  - `get-share` (token): returns only that participant's items, the split explanation, the amount, the payer's display name and payment usernames. Never the payer's total, the payer's personal items, or anyone else's items.
  - `claim-payment` (token, amount): creates a claimed payment.
  - `flag-problem` (token, message): sends a note to the payer.
- The payment page, matching the "Jeff's payment link" design:
  - Header "Private link for Jeff," and a key block "Leo says you owe $15.00."
  - The item breakdown.
  - "Pay $15.00 with Venmo," plus PayPal and Cash App if the payer set them up.
  - "I paid Leo," with an editable amount for partial payments, and "Something looks wrong."
  - A link to get the app.
- A text opt-in checkbox on the payment page, unchecked by default, labeled: "Text me about payments with Leo. Msg and data rates may apply. Reply STOP to opt out." Checking it saves a row in `sms_consents` with the time and source.
- The page loads fast on a phone and is deployed to Vercel.
- Request payment now sends the page link instead of the bare Venmo link.
- Push notifications through Expo: store tokens, and notify the payer when a claim or problem arrives ("Jeff says he paid $15.00").
- An optional setting to auto-confirm claims after a few days, off by default.

**Done when:**

- Jeff's link, opened in a phone browser without an account, shows only the 3 shared items and $15.00.
- Tapping "I paid Leo" creates a claim, and Leo gets a push and confirms it. The balance drops.
- A revoked link stops working.
- Tests confirm the `get-share` response never contains Maya's items, Leo's personal items or the $140 total.

**Not yet:** backend texts.

## Step 9: Receipt scanning

**Goal:** a photo of a receipt fills in the split screen.

**Build:**

- Take a photo or pick one. Shrink it on the phone (`expo-image-manipulator`), then upload it to a private Storage bucket only the payer can read.
- An `extract-receipt` Edge Function:
  - Sends the image to Claude Haiku 5.5 and asks for structured JSON: merchant, date, items (name and amount in cents), tax, tip, discounts, total.
  - Uses tool use or structured output with a JSON schema, and low effort or thinking off.
  - Keeps the API key on the server.
- A math check in code: items plus tax plus tip minus discounts must equal the total. If it fails, retry with Claude Sonnet 5.5. If that fails too, return the draft with the mismatch flagged.
- A row in `receipt_extractions` for every attempt, with model, status and error.
- A review screen: the Split screen prefilled, with mismatches highlighted. The user edits, assigns items and saves through `save_expense`.
- Categories from simple merchant rules first. The AI's category is only a suggestion.
- A limit on scans per user per month, configurable.
- A script that runs a folder of about 20 real receipts through the extraction and reports accuracy per model. Keep the receipts out of git.

**Done when:**

- A Costco-style receipt photo gives a draft with the correct items and total.
- A blurry photo gives a clear message and falls back to manual entry.
- The API key isn't in the app bundle.

**Not yet:** email receipts.

## Step 10: Forwarded email receipts

**Goal:** forwarding an order email creates a draft to split.

**Build:**

- Settings:
  - Add the email addresses you forward from, each verified with a code.
  - Show `receipts@in.yourapp.com` with a copy button.
  - A personal auto-forward address (`receipts+<token>@in.yourapp.com`) for Gmail filters.
- A `postmark-inbound` Edge Function:
  - Checks a shared secret, saves the email to `inbound_emails` as received, and responds with 200 right away.
  - Processes in the background (for example with `EdgeRuntime.waitUntil`).
  - Finds the user by the plus-address token (Postmark's `MailboxHash`) or by verified sender. An unknown sender gets an automatic reply explaining how to add the address.
  - Extracts from the text body or a PDF or image attachment, using the same extraction and math check as Step 9.
  - Creates a draft under Needs you.
  - Skips duplicates by provider message id, and by matching amount, date and merchant.
  - Deletes the raw email once extracted.
- Gmail forwarding confirmation: if an email comes from Gmail's forwarding confirmation address, show its code to the user in the app.
- Text inside emails is never treated as instructions. Extraction only fills in the schema.
- For testing before you own a domain, use Postmark's built-in inbound address.

**Done when:**

- Forwarding an Amazon order email creates a draft under Needs you within a minute.
- Forwarding it twice doesn't create a duplicate.
- An unknown sender gets the reply.

**Not yet:** launch items.

## Step 11: Launch readiness

**Goal:** ready for people outside your apartment.

**Build:**

- Sentry in the app and the Edge Functions, with email alerts.
- `sendText()` with Twilio or Telnyx. In development it only writes to `outbound_messages` with status logged. It enforces:
  - Only send to phones with active consent.
  - The first message names the app and says "Reply STOP to opt out."
  - A STOP webhook revokes consent.
  - At most one reminder per debt every 3 days.
  - No texts between 9pm and 9am.
- Text opt-in for account holders when they verify their phone number, unchecked by default.
- Daily reminders with Supabase Cron. Find debts unpaid for more than 3 days, then:
  - Push account holders.
  - Text people who opted in.
  - Otherwise, remind the payer to send a reminder from their own phone.
- Privacy:
  - A privacy policy page and a support page on the web host.
  - "Export my data" and "Delete my account."
  - Revoking private links.
- A domain with DNS on Cloudflare. Move the payment page and the receipts address to it, and set up Universal Links and App Links so payment links open the app when it's installed.
- Builds with EAS: TestFlight and Google Play internal testing, plus store listings.
- Register your 10DLC texting brand and campaign early (sole proprietor is fine), since approval takes time.
- Backups: the free Supabase plan has no downloadable backups, so schedule a database export or move to Supabase Pro.

**Done when:**

- A tester outside your apartment installs through TestFlight, gets a reminder, and pays.
- Sentry receives a test error.
- Replying STOP stops texts.

---

## Later

- CSV import from bank exports, matching incoming repayments to debts so they aren't counted as income.
- Bank sync.
- Axiom for logs, if Sentry and the status tables aren't enough.
- Moving server code to Cloudflare Workers if costs grow.
- Supabase Pro for 7-day logs and backups.
- Stored balances that update with each event, once groups have long histories.
- Custom link previews for payment links (no amounts in the preview).
