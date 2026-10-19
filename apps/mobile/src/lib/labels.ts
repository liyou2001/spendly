import type { Debt, ParticipantId } from '@spendly/ledger';

/** "Jeff", "Jeff and Maya", "Leo, Jeff and Maya". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "Jeff owes you", "You owe Maya", or "Jeff owes Maya" when neither side is you. */
export function debtLabel(
  debt: Pick<Debt, 'from' | 'to'>,
  me: ParticipantId,
  nameOf: (participantId: ParticipantId) => string,
): string {
  if (debt.to === me) return `${nameOf(debt.from)} owes you`;
  if (debt.from === me) return `You owe ${nameOf(debt.to)}`;
  return `${nameOf(debt.from)} owes ${nameOf(debt.to)}`;
}

/** "3 × Soft drink" for more than one, otherwise just the name. */
export function itemTitle(name: string, quantity: number): string {
  return quantity > 1 ? `${quantity} × ${name}` : name;
}

/**
 * Your part of an item: "Your 2 of 3" when it was tagged one by one, "Split 2 ways" when split
 * evenly, or null when it was all yours.
 */
export function yourPartOf(item: {
  splitCount: number;
  myUnits: number;
  totalUnits: number;
}): string | null {
  if (item.totalUnits !== item.splitCount) return `Your ${item.myUnits} of ${item.totalUnits}`;
  return item.splitCount > 1 ? `Split ${item.splitCount} ways` : null;
}
