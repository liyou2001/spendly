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
