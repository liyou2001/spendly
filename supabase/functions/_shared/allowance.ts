// One definition of "scans left this month", for extract-receipt (which enforces it) and
// scan-allowance (which shows it), so the two always agree.
import type { AdminClient } from './admin.ts';
import { monthlyScanLimit, nextMonthStart } from './receipt.ts';

export interface ScanAllowance {
  limit: number;
  used: number;
  left: number;
  /** When the count starts again: the 1st of next month, UTC. */
  resetsOn: string;
}

/** Throws if the count can't be read. */
export async function scanAllowance(
  admin: AdminClient,
  userId: string,
  now: Date = new Date(),
): Promise<ScanAllowance> {
  const limit = monthlyScanLimit(Deno.env.get('RECEIPT_SCANS_PER_MONTH'));
  const { data, error } = await admin.rpc('receipt_scans_this_month', { p_user_id: userId });
  if (error) throw error;
  const used = data as number;
  return { limit, used, left: Math.max(limit - used, 0), resetsOn: nextMonthStart(now) };
}
