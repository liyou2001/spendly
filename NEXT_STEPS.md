# Next steps: open questions for user feedback

Product and design choices made while building that real users should confirm. Bring these to user interviews or test sessions, record what you learn, then update the app or the plan.

For each question, the **How to test** line suggests something to ask or a task to watch someone do. Watching someone try a task usually tells you more than asking whether they like something.

**Status:** Open · Testing · Answered (write the outcome under the question).

---

## Navigation and settings

### 1. Is Me → Profile & payments / Categories where people expect settings?

- **Status:** Open
- **Now:** the Me tab is a settings hub. Name and payment usernames are under **Profile & payments**; adding, renaming and deleting categories is under **Categories**. Monthly budgets will live in the Budget tab (Step 7).
- **Why it matters:** if people look for categories in Budget or Add expense and can't find them, they'll make do with "Other" and their budget gets less useful.
- **How to test:** "You want a category for textbooks. Show me how you'd add one." Watch where they go first, and whether they expect Budget and Categories to be in the same place.

### 2. Should a new category be creatable from Add expense, too?

- **Status:** Open
- **Now:** categories can only be added in Me → Categories. Add expense only shows the existing ones.
- **Why it matters:** the need for a new category usually comes up while entering an expense. Leaving the form to create one may be annoying, or rare enough not to matter.
- **How to test:** after question 1, ask whether they'd have wanted to add it without leaving the expense.

## Splitting an expense

### 3. Do people understand tapping an item's tag to change who it's for?

- **Status:** Open
- **Now:** each item has a tag that cycles You → All → each person → Custom (pick a subset) on every tap.
- **Why it matters:** this is the core of splitting a receipt. If it isn't discovered, people will put everything on All or give up on itemizing.
- **How to test:** give them the Costco receipt from the plan and ask them to split it without explaining the tags. Note how long it takes them to find the cycling, and whether Custom makes sense.

### 4. Are the defaults right: new items on "You", and the newest shared group?

- **Status:** Open
- **Now:** each new item starts as **You**, and Add expense opens on your most recently created shared group (or Personal if you have none).
- **Why it matters:** good defaults save taps on every expense. If most receipts are mostly shared, **All** might be the better default.
- **How to test:** ask what share of their purchases are mostly shared versus mostly theirs. Watch how often they change the default.

### 5. Is "Itemized" versus "Just a total" clear?

- **Status:** Open
- **Now:** two chips switch between entering line items and entering one total, split evenly or by amounts.
- **Why it matters:** for quick things like pizza, most people probably want the total. They should find that mode immediately.
- **How to test:** "You and Jeff split a $30 pizza. Add it." See whether they find Just a total, or type it as one item.

### 6. Is requiring a category for your share too much friction?

- **Status:** Open
- **Now:** you can't save until you pick a category, whenever you have a share.
- **Why it matters:** required fields make entry slower, but without a category spending can't go into a budget.
- **How to test:** watch whether people hesitate or pick at random. Ask whether a default (for example the last one they used) would be better.

### 7. Is stepping the date with ‹ › good enough?

- **Status:** Open
- **Now:** the date starts at today and moves one day per tap. There's no calendar picker, and no future dates.
- **Why it matters:** entering a receipt from two weeks ago takes 14 taps. Step 9 (scanning) will fill in dates, but manual entry still happens.
- **How to test:** ask how old their receipts usually are when they enter them, and have them enter one from last week.

### 8. Does the privacy note reassure people, and do they believe it?

- **Status:** Open
- **Now:** the summary says, for example, "Jeff and Maya each see only their own items and amount, never the total."
- **Why it matters:** privacy (Rule 5) is a main reason to pick this app over a spreadsheet. People should notice it and trust it.
- **How to test:** after they save, ask "What can Jeff see about this purchase?" Compare their answer with what's actually true.

## Expenses, balances and history

### 9. Will people want "Edit" instead of "Void"?

- **Status:** Open
- **Now:** history is append-only (Rule 2). The app only offers **Void expense**, and you re-enter a corrected one. The database can already link a correction to the expense it replaces, but no screen uses that yet.
- **Why it matters:** "void and re-enter" may feel heavy for a typo. An **Edit** button could void and replace behind the scenes while keeping the history.
- **How to test:** "You typed $22.99 instead of $12.99. Fix it." Watch what they look for.

### 10. Do people expect to see the whole group's balances, or only their own?

- **Status:** Open
- **Now:** you only see balances that involve you. Who owes whom between Jeff and Maya is hidden, because it would reveal their shares.
- **Why it matters:** some roommates may want a full "who owes whom" view to settle up all at once, which conflicts with privacy.
- **How to test:** ask how their household settles up today, and whether one person tracks everything.

### 11. Is "overpaying flips the debt" what people expect?

- **Status:** Open
- **Now:** if Jeff owes $15 and pays $20, the app shows that you owe Jeff $5.
- **Why it matters:** it's correct accounting, but people might expect the extra to count as credit toward future expenses, or a warning when it happens.
- **How to test:** describe the situation and ask what they'd expect the app to show.

### 12. Should forgiven debt count in the month of the purchase or the month you forgave it?

- **Status:** Open
- **Now:** if you forgive Jeff's $15 for an October Costco trip in November, the $15 is added to your October spending, in that trip's category.
- **Why it matters:** changing a past month's numbers can confuse people reviewing their budget.
- **How to test:** walk them through the example and ask which month they'd expect to see it in.

### 13. Should someone else's expense be categorized for you automatically?

- **Status:** Open
- **Now:** when Maya pays and you have a share, it shows as uncategorized in your spending unless you pick a category for it.
- **Why it matters:** uncategorized spending makes budgets less useful. A default (for example the same category name as Maya's, if you have one) could help.
- **How to test:** once Step 7 is in, ask account holders whether they'd categorize these by hand.

## Categories

### 14. What should happen to a category that's in use when someone wants to delete it?

- **Status:** Open
- **Now:** deleting is blocked with "rename it instead."
- **Why it matters:** people may want to merge two categories (for example "Food" into "Groceries"), which we don't support yet.
- **How to test:** ask whether they've ever wanted to combine or remove categories in other budgeting apps.

### 15. Do people want a different category for each line item?

- **Status:** Open
- **Now:** your whole share of an expense goes in one category. In the plan's example, Leo's $83 includes a $12.99 graphic tee but is all filed under Groceries.
- **Why it matters:** mixed receipts (Costco, Target, Amazon) skew budgets, but a category control on every item row makes the busiest screen busier. Most people may not bother when typing by hand. It also needs a schema change (a category for your portion of each item) and an exact split of your share, including tax and tip, across categories.
- **Possible approach, if wanted:** keep one category as the default and allow an optional per-item override ("my part of this goes in Clothing"). Best after Step 9, when scanning can suggest a category per line. "Advanced budgeting" is out of scope for the MVP, so this would be post-MVP.
- **How to test:** ask how often their receipts mix categories, and whether they'd fix the split or not care. After they save a mixed receipt, ask whether their Groceries total looks right to them.

## Sign-in and people

### 16. Is an emailed one-time code an acceptable way to sign in?

- **Status:** Open
- **Now:** email code only. Phone sign-in comes later; there are no passwords.
- **Why it matters:** students may prefer phone codes or Apple/Google sign-in. Switching to the email app every time adds friction.
- **How to test:** time a first sign-in and ask how they'd prefer to sign in.

### 17. Do people add phone numbers for roommates?

- **Status:** Open
- **Now:** phone is optional when adding a person. Step 6 uses it to open a prefilled payment request in Messages.
- **Why it matters:** payment requests and reminders depend on it. If people skip it, Step 6 should ask for it at the moment it's needed instead.
- **How to test:** see whether they fill it in while creating a group, and ask why or why not.
