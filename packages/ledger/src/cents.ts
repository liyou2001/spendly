/**
 * Money is always a whole number of cents (Rule 1).
 * Returns true only for safe integers, so 1500 passes and 15.0001 does not.
 */
export function isCents(value: number): boolean {
  return Number.isSafeInteger(value);
}
