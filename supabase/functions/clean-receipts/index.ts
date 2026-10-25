// clean-receipts: called daily by pg_cron (private.request_receipt_cleanup) with a shared secret
// (CRON_SECRET). Deletes receipt photos more than a day old that no expense uses: scans never
// saved, saved without the photo, or scanned again. Storage refuses deletes through SQL, so
// this goes through the Storage API.
import { adminClient } from '../_shared/admin.ts';
import { fail, json, sameSecret } from '../_shared/http.ts';

/** Photos younger than this may still be on someone's Add expense screen. */
const KEEP_UNATTACHED_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) {
    console.error('CRON_SECRET is not set');
    return fail(503, 'Not set up');
  }
  if (!sameSecret(req.headers.get('X-Cron-Secret') ?? '', secret)) return fail(401, 'Unauthorized');

  const admin = adminClient();
  const { data, error } = await admin.rpc('unattached_receipts', {
    p_older_than: new Date(Date.now() - KEEP_UNATTACHED_MS).toISOString(),
  });
  if (error) {
    console.error(error);
    return fail(500, 'Couldn’t list photos');
  }
  const paths = (data ?? []) as string[];
  let deleted = 0;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const { error: removeError } = await admin.storage.from('receipts').remove(batch);
    if (removeError) console.error('Couldn’t delete photos', removeError);
    else deleted += batch.length;
  }
  return json({ unattached: paths.length, deleted });
});
