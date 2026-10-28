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

/** Photos one scan session (one expense) may read: a scan and 5 rescans. */
export const MAX_SESSION_PHOTOS = 6;
/** Attempts that count: read, read but not adding up, or not a receipt. Our own failures don't. */
const COUNTED = ['succeeded', 'mismatch', 'unreadable'];

/** What extract-receipt checks before reading a photo. Throws if they can't be read. */
export async function photoChecks(
  admin: AdminClient,
  userId: string,
  path: string,
  session: string | null,
): Promise<{ alreadyRead: boolean; attached: boolean; sessionPhotos: number }> {
  const [read, attached, sessionRows] = await Promise.all([
    admin
      .from('receipt_extractions')
      .select('id')
      .eq('user_id', userId)
      .eq('storage_path', path)
      .in('status', COUNTED)
      .limit(1),
    admin.from('expense_receipts').select('expense_id').eq('storage_path', path).limit(1),
    session
      ? admin
          .from('receipt_extractions')
          .select('storage_path')
          .eq('user_id', userId)
          .eq('scan_session', session)
          .in('status', COUNTED)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [read, attached, sessionRows]) if (result.error) throw result.error;
  return {
    alreadyRead: (read.data ?? []).length > 0,
    attached: (attached.data ?? []).length > 0,
    sessionPhotos: new Set((sessionRows.data ?? []).map((r) => r.storage_path)).size,
  };
}
