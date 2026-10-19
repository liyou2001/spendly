# Spendly

Budgeting app for college students that handles shared money correctly. The full build plan is in `docs/PLAN.md`; work on one step at a time and don't build ahead of the current step.

## Working in this repo

- Node 24 (`nvm use`, see `.nvmrc`). npm workspaces: `apps/*`, `packages/*`.
- `npm test` runs every workspace's tests. `npm run lint`, `npm run typecheck`, `npm run format:check` must pass before a step is done.
- Supabase CLI is a dev dependency: run it as `npx supabase ...` from the repo root.
- Database: schema changes go in a new file in `supabase/migrations/` (never edit an applied one). Then `npm run db:reset`, `npm run db:test` and `npm run db:types`. `DATA_MODEL.md` must stay in sync with the migrations.
- Expo app: add packages with `npx expo install <pkg>` from `apps/mobile`, never plain `npm install`. Routes live in `apps/mobile/src/app/`. Expo changes between SDKs; see `apps/mobile/AGENTS.md` and check the versioned docs before using an Expo API.

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

- **Colors:** white `#FFFFFF` background. Light purple `#EAE4FF` for the one key block per screen, the active tab, "You" tags and avatars. Deep purple `#6D4FD3` for primary buttons, selected chips and the + (add expense) button (white text and icons on them), and for progress bars and attention dots. Ink `#2B2420` for text. Muted `#6B5F57` for secondary text. Dividers `#F1E7DF`. Control borders `#E2D5CB`.
- **Type:** Hanken Grotesk, weights 300/400/500/600. Big numbers 52px at weight 300, letter-spacing -0.03em, tabular figures. Screen titles 24–28px/500. Section headings 15px/600. Body 15–16px/400. Small text 13–14px in muted.
- **Layout:** 24px side margins, about 28px between sections. Lists separated by thin dividers, not cards. Key block corner radius 24px. Buttons radius 14px, at least 44px tall. Tags fully rounded.
- **Tabs:** Home, Budget, + (deep purple circle, adds an expense), People, Me.
- Stroke icons, no emoji. Text contrast at least 4.5:1.
