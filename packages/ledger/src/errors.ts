/** Thrown when ledger input breaks a money rule (non-integer cents, shares that don't add up, ...). */
export class LedgerError extends Error {
  override name = 'LedgerError';
}
