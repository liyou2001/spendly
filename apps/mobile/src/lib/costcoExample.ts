import { computeShares, type Cents } from '@spendly/ledger';

import { explainShare, ledgerLines, type BillLine, type Explained } from './breakdown';

// The plan's example, shown on the web landing page and in the tutorial: Leo pays $140.00 at
// Costco and splits it by item. The same receipt as supabase/seed.sql, run through the same math
// as real expenses, so every amount matches what the app shows for it.

export type ExamplePerson = 'Leo' | 'Jeff' | 'Maya';

// In the seed's order of participant ids, so leftover cents land on the same people.
const IDS: Record<ExamplePerson, string> = { Leo: 'p1', Jeff: 'p2', Maya: 'p3' };

const ITEMS: { name: string; cents: Cents; people: ExamplePerson[] }[] = [
  { name: 'Protein powder', cents: 4799, people: ['Leo'] },
  { name: 'Graphic tee', cents: 1299, people: ['Leo'] },
  { name: 'Granola bars', cents: 702, people: ['Leo'] },
  { name: 'Paper towels', cents: 2299, people: ['Leo', 'Jeff', 'Maya'] },
  { name: 'Dish soap', cents: 1149, people: ['Leo', 'Jeff', 'Maya'] },
  { name: 'Trash bags', cents: 1052, people: ['Leo', 'Jeff', 'Maya'] },
  { name: 'Oat milk', cents: 1249, people: ['Maya'] },
  { name: 'Hummus', cents: 899, people: ['Maya'] },
  { name: 'Veggie chips', cents: 552, people: ['Maya'] },
];

const LINES: BillLine[] = ITEMS.map((item) => ({
  name: item.name,
  amountCents: item.cents,
  kind: 'item',
  quantity: 1,
  participantIds: item.people.map((person) => IDS[person]),
  units: [],
  byUnits: false,
}));

const computed = computeShares({ lines: ledgerLines(LINES) });

export const COSTCO_TOTAL_CENTS: Cents = computed.totalCents;

export const COSTCO_ITEM_COUNT = ITEMS.length;

/** One person's share of the receipt: Leo's is his spending, the others' is what they owe him. */
export function costcoShare(person: ExamplePerson): Cents {
  return computed.shares.find((share) => share.participantId === IDS[person])?.amountCents ?? 0;
}

/** "How Jeff's $15.00 was worked out", exactly as the expense screen has it. */
export function costcoBreakdown(person: ExamplePerson): Explained | null {
  return explainShare(LINES, IDS[person]);
}

/**
 * The items for the same people, one line each ("Protein powder, graphic tee, granola bars"),
 * for the landing page.
 */
export const COSTCO_ITEM_GROUPS = ITEMS.reduce<
  { names: string; cents: Cents; people: ExamplePerson[] }[]
>((groups, item) => {
  const last = groups[groups.length - 1];
  if (last && last.people.join() === item.people.join()) {
    last.names += `, ${item.name.toLowerCase()}`;
    last.cents += item.cents;
  } else {
    groups.push({ names: item.name, cents: item.cents, people: item.people });
  }
  return groups;
}, []);
