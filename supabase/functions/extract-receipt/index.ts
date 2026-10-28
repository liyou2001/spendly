// extract-receipt: reads a receipt photo you uploaded into a draft for the split screen, with
// Gemini or Claude (see _shared/reader.ts). Signed in only, for photos in your own folder,
// within a monthly limit. Photos sent with the same `session` (one Add expense) count as one
// scan, up to 6 of them; each photo is read once. A photo that reads as a receipt is kept, so
// the app can attach it to the expense (attach_receipt); one that doesn't is deleted, and
// clean-receipts deletes kept ones that never get attached. Every attempt is logged in
// receipt_extractions.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import {
  MAX_SESSION_PHOTOS,
  photoChecks,
  scanAllowance,
  type ScanAllowance,
} from '../_shared/allowance.ts';
import { corsHeaders, fail, json, readBody, TOO_MANY } from '../_shared/http.ts';
import { receiptReader } from '../_shared/reader.ts';
import { extractReceipt, toBase64 } from '../_shared/receipt.ts';

const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const admin = adminClient();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth.user;
  if (!user) return fail(401, 'Sign in first.');

  const body = await readBody(req);
  const path = body?.path;
  const ownPhoto = new RegExp(`^${user.id}/[0-9a-f-]{36}\\.jpg$`);
  if (typeof path !== 'string' || !ownPhoto.test(path)) return fail(400, 'Which photo?');
  // Without one (an older app), each photo counts as its own scan.
  const session =
    typeof body?.session === 'string' && UUID.test(body.session) ? body.session : null;

  const reader = receiptReader();
  if (!reader) {
    console.error('No receipt reader: set GEMINI_API_KEY or ANTHROPIC_API_KEY');
    return fail(503, 'Receipt scanning isn’t set up yet. Enter it by hand for now.');
  }
  if (!(await withinLimit(admin, `receipt:user:${user.id}`, 20, 3600))) return fail(429, TOO_MANY);
  let allowance: ScanAllowance;
  let checks: Awaited<ReturnType<typeof photoChecks>>;
  try {
    [allowance, checks] = await Promise.all([
      scanAllowance(admin, user.id),
      photoChecks(admin, user.id, path, session),
    ]);
  } catch (error) {
    console.error('Couldn’t count scans', error);
    return fail(500, 'Something went wrong. Try again.');
  }
  // Each photo is read once, and one kept with an expense is never touched: an unreadable result
  // would delete the photo the group checks its split against.
  if (checks.alreadyRead || checks.attached) {
    return fail(409, 'That photo was already scanned. Take a new one.');
  }
  if (checks.sessionPhotos >= MAX_SESSION_PHOTOS) {
    return fail(429, 'That’s the most rescans for one expense. Enter the rest by hand.');
  }
  // Rescans for the same expense are free; a new one needs a scan left this month.
  const newScan = checks.sessionPhotos === 0;
  if (newScan && allowance.left <= 0) {
    return fail(
      429,
      allowance.limit === 0
        ? 'Receipt scanning is off for now. Enter it by hand.'
        : `You’ve used all ${allowance.limit} receipt scans this month. Enter it by hand for now.`,
    );
  }

  const { data: photo, error: downloadError } = await admin.storage.from('receipts').download(path);
  if (downloadError || !photo) return fail(404, 'Couldn’t find that photo. Try again.');
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const discard = async () => {
    const { error } = await admin.storage.from('receipts').remove([path]);
    if (error) console.error('Couldn’t delete the photo', error);
  };
  if (bytes.length > MAX_BYTES) {
    await discard();
    return fail(413, 'That photo is too large.');
  }
  const imageBase64 = toBase64(bytes);

  const { data: categories } = await admin.from('categories').select('name').eq('user_id', user.id);
  const categoryNames = (categories ?? []).map((c) => c.name as string);

  const outcome = await extractReceipt(
    reader.models,
    (model) =>
      reader.ask(
        model,
        { kind: 'image', base64: imageBase64, mediaType: 'image/jpeg' },
        categoryNames,
      ),
    async (attempt) => {
      const { error } = await admin.from('receipt_extractions').insert({
        user_id: user.id,
        source: 'photo',
        storage_path: path,
        scan_session: session,
        model: attempt.model,
        status: attempt.status,
        result: attempt.result,
        error: attempt.error,
      });
      if (error) console.error('Couldn’t log the attempt', error);
    },
  );
  // Only a photo that reads as a receipt is worth keeping.
  if (outcome.status === 'failed' || outcome.status === 'unreadable') await discard();
  if (outcome.status === 'failed') {
    return fail(502, 'Couldn’t read receipts right now. Try again, or enter it by hand.');
  }
  // A new expense's first photo uses a scan; rescans don't. The limit and reset date let the app
  // show the count from this alone.
  return json({
    ...outcome,
    scans_left: newScan ? Math.max(allowance.left - 1, 0) : allowance.left,
    scan_limit: allowance.limit,
    resets_on: allowance.resetsOn,
    rescans_left: session ? MAX_SESSION_PHOTOS - (checks.sessionPhotos + 1) : null,
  });
});
