# Data model

The Supabase Postgres schema, drawn from the migrations in `supabase/migrations/`. The plan's version is in [docs/PLAN.md](docs/PLAN.md#data-model). If the two disagree, the migrations win.

`users` is Supabase's `auth.users`. All money is `bigint` cents.

## People, groups and the ledger

Every expense belongs to a group. Each user also gets an automatic Personal group containing only them.

```mermaid
erDiagram
    users ||--|| profiles : "has"
    users ||--o{ groups : "creates"
    groups ||--o{ participants : "has"
    users |o--o{ participants : "is (optional)"

    groups ||--o{ expenses : "has"
    participants ||--o{ expenses : "paid_by"
    expenses |o--o| expenses : "replaces_expense_id"
    expenses ||--o{ expense_items : "has lines"
    expense_items ||--o{ item_assignments : "assigned to"
    participants ||--o{ item_assignments : "is assigned"
    expenses ||--|{ shares : "split into"
    participants ||--o{ shares : "owes"

    groups ||--o{ payments : "has"
    participants ||--o{ payments : "from / to"
    expenses |o--o{ payments : "forgiveness only"

    profiles {
        uuid id PK "= users.id"
        text display_name
        text venmo_username
        text paypal_username
        text cashapp_tag
    }
    groups {
        uuid id PK
        text name
        uuid created_by FK
        boolean is_personal "one per user"
    }
    participants {
        uuid id PK
        uuid group_id FK
        text display_name
        uuid user_id FK "null = no account"
        text phone "E.164, optional"
    }
    expenses {
        uuid id PK
        uuid group_id FK
        uuid paid_by FK "participant in the same group"
        text merchant
        date expense_date
        bigint total_cents "> 0"
        uuid category_id FK "payer's category"
        text source "manual | photo | email"
        uuid created_by FK
        timestamptz voided_at "set once, never cleared"
        uuid voided_by FK
        uuid replaces_expense_id FK "the expense this corrects"
    }
    expense_items {
        uuid id PK
        uuid expense_id FK
        text name
        bigint amount_cents "> 0, discounts < 0"
        text kind "item | tax | tip | discount"
        int position
    }
    item_assignments {
        uuid item_id PK
        uuid participant_id PK "several rows = split equally"
    }
    shares {
        uuid expense_id PK
        uuid participant_id PK
        bigint amount_cents ">= 0, sum = expense total"
        uuid category_override_id FK "participant's own category"
    }
    payments {
        uuid id PK
        uuid group_id FK
        uuid from_participant FK "who owed"
        uuid to_participant FK "who was owed"
        bigint amount_cents "> 0"
        text kind "payment | forgiveness"
        uuid expense_id FK "forgiveness only"
        text status "claimed | confirmed | rejected"
        text method "venmo | paypal | cashapp | cash | other"
        uuid recorded_by FK
        uuid decided_by FK
        timestamptz decided_at
    }
```

## Budgets

```mermaid
erDiagram
    users ||--o{ categories : "owns"
    users ||--o{ budgets : "sets"
    categories ||--o{ budgets : "limit per month"
    categories |o--o{ expenses : "payer's category"
    categories |o--o{ shares : "category_override_id"

    categories {
        uuid id PK
        uuid user_id FK
        text name "Rent, Groceries, Dining, Transport, Fun, Other"
    }
    budgets {
        uuid user_id PK
        uuid category_id PK "must be the same user's"
        date month PK "first day of the month"
        bigint amount_cents ">= 0"
    }
    expenses {
        uuid id PK
        uuid category_id FK
    }
    shares {
        uuid expense_id PK
        uuid participant_id PK
        uuid category_override_id FK
    }
```

## Payment page, texting, receipts, push

These tables are read and written by Edge Functions (Steps 8–11), not by the app directly.

```mermaid
erDiagram
    participants ||--o{ share_links : "private link"
    participants |o--o{ sms_consents : "consents"
    users |o--o{ sms_consents : "consents"
    users ||--o{ receipt_extractions : "scans"
    users |o--o{ inbound_emails : "forwards"
    users ||--o{ verified_emails : "verifies"
    users ||--o{ push_tokens : "registers"

    share_links {
        uuid id PK
        uuid participant_id FK
        text token_hash UK "only the hash is stored"
        timestamptz revoked_at
    }
    sms_consents {
        uuid id PK
        text phone "E.164"
        uuid participant_id FK
        uuid user_id FK
        timestamptz consented_at
        text source "payment_page | app"
        timestamptz revoked_at "set by STOP"
    }
    outbound_messages {
        uuid id PK
        text to_phone
        text body
        text status "logged | sent | failed"
        text provider_id
        text error
    }
    receipt_extractions {
        uuid id PK
        uuid user_id FK
        text source "photo | email"
        text storage_path
        text model
        text status "pending | succeeded | mismatch | failed"
        jsonb result
        text error
    }
    inbound_emails {
        uuid id PK
        text provider_message_id UK
        text from_address
        uuid user_id FK
        text status
        text error
    }
    verified_emails {
        uuid user_id PK
        text email PK
        timestamptz verified_at "null until the code is entered"
    }
    push_tokens {
        text token PK
        uuid user_id FK
    }
```

## How money flows

Using the plan's Costco example: Leo pays $140.00, the household items are split three ways, and Maya's food is hers alone.

```mermaid
flowchart LR
    receipt["expense_items<br/>9 lines, $140.00"] --> assign["item_assignments<br/>who each item is for"]
    assign --> shares["shares<br/>Leo 8300 · Jeff 1500 · Maya 4200"]
    shares --> balances["balances()<br/>Jeff owes Leo 1500<br/>Maya owes Leo 4200"]
    payments["payments<br/>confirmed only"] --> balances
    shares --> spending["my_spending()<br/>Leo: Groceries 8300"]
    forgiveness["payments<br/>kind = forgiveness"] --> spending
```

- **Shares** come from `computeShares` in `packages/ledger` and are saved with `save_expense`. The database rejects any expense whose shares (or items) don't add up to its total.
- **Balances** are never stored. They're calculated from shares of expenses that aren't voided, minus confirmed payments and forgiveness.
- **Spending** is your own shares plus debts you forgave. Repayments never count.

## Rules the database enforces

| Rule                               | How                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money is whole cents               | `bigint` columns; amount checks (positive, discounts negative)                                                                                                                                                                                    |
| History is append-only             | No UPDATE/DELETE grants on `expenses`, `expense_items`, `item_assignments`, `shares`, `payments`, plus triggers that block changes even for the table owner. The only changes allowed are voiding an expense once and deciding a claimed payment. |
| Shares add up                      | A check at commit: shares, and items when there are any, must sum to `total_cents`                                                                                                                                                                |
| People belong to the group         | `paid_by`, `from_participant` and `to_participant` must be participants in the same group (composite foreign keys)                                                                                                                                |
| Forgiveness is the payer's to give | A forgiveness must name an expense, and its `to_participant` must be that expense's payer                                                                                                                                                         |
| Budgets use your own categories    | `budgets (category_id, user_id)` references `categories (id, user_id)`                                                                                                                                                                            |

## Who can read what

Nothing is readable without signing in. Signed-in users see:

| Data                                                   | Who                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Full expense, its items, assignments and shares        | The payer and whoever entered it                                                                         |
| Your part of an expense someone else paid              | You, only through `get_my_shares()`: your items and your amount, never the total or other people's items |
| Groups and their participants                          | Members of the group                                                                                     |
| Profiles                                               | You, and people who share a group with you                                                               |
| Payments                                               | The two people involved, and whoever recorded it                                                         |
| Categories, budgets, push tokens                       | Their owner                                                                                              |
| Payment links, text consents, messages, inbound emails | Edge Functions only                                                                                      |

People without accounts see their share only through the `get-share` Edge Function (Step 8), with a private link.

## Database functions

| Function                     | What it does                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save_expense(...)`          | Inserts an expense with its items, assignments and shares in one transaction. Rejects shares that don't sum to the total. Can replace (void) an earlier expense. |
| `create_group(name, people)` | Creates a group with you in it plus any name-only people, in one transaction.                                                                                    |
| `void_expense(id)`           | Marks an expense voided. Never deletes it.                                                                                                                       |
| `balances()`                 | Net who-owes-whom for every pair that includes you.                                                                                                              |
| `my_spending()`              | Your spending by month and category.                                                                                                                             |
| `get_my_shares()`            | Your items and amount on expenses other people paid.                                                                                                             |
| Signup trigger               | Creates your profile, Personal group and default categories.                                                                                                     |
| Name sync trigger            | Renaming yourself updates your name in every group you're in.                                                                                                    |
