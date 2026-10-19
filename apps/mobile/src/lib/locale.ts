/**
 * The decimal separator for the phone's region, which is also what its number pad shows:
 * "," in e.g. Germany or France, "." in the US. Falls back to "." if the platform can't say.
 */
export function deviceDecimalSeparator(): '.' | ',' {
  try {
    const part = new Intl.NumberFormat().formatToParts(1.5).find((p) => p.type === 'decimal');
    return part?.value === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}
