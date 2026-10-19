// extract-receipt: reads a receipt photo you uploaded into a draft for the split screen, with
// Gemini or Claude (see _shared/reader.ts). Signed in only, for photos in your own folder,
// within a monthly limit. Every attempt is logged in receipt_extractions.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import { corsHeaders, fail, json, readBody, TOO_MANY } from '../_shared/http.ts';
import { receiptReader } from '../_shared/reader.ts';
import { extractReceipt, toBase64 } from '../_shared/receipt.ts';

const MAX_BYTES = 5 * 1024 * 1024;

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

  const reader = receiptReader();
  if (!reader) {
    console.error('No receipt reader: set GEMINI_API_KEY or ANTHROPIC_API_KEY');
    return fail(503, 'Receipt scanning isn’t set up yet. Enter it by hand for now.');
  }
  if (!(await withinLimit(admin, `receipt:user:${user.id}`, 20, 3600))) return fail(429, TOO_MANY);
  const limit = Number(Deno.env.get('RECEIPT_SCANS_PER_MONTH') ?? '50');
  const { data: used, error: countError } = await admin.rpc('receipt_scans_this_month', {
    p_user_id: user.id,
  });
  if (countError) return fail(500, 'Something went wrong. Try again.');
  if (used >= limit) {
    return fail(
      429,
      `You’ve used all ${limit} receipt scans this month. Enter it by hand for now.`,
    );
  }

  const { data: photo, error: downloadError } = await admin.storage.from('receipts').download(path);
  if (downloadError || !photo) return fail(404, 'Couldn’t find that photo. Try again.');
  if (photo.size > MAX_BYTES) return fail(413, 'That photo is too large.');
  const imageBase64 = toBase64(new Uint8Array(await photo.arrayBuffer()));

  const { data: categories } = await admin.from('categories').select('name').eq('user_id', user.id);
  const categoryNames = (categories ?? []).map((c) => c.name as string);

  const outcome = await extractReceipt(
    reader.models,
    (model) => reader.ask(model, { base64: imageBase64, mediaType: 'image/jpeg' }, categoryNames),
    async (attempt) => {
      const { error } = await admin.from('receipt_extractions').insert({
        user_id: user.id,
        source: 'photo',
        storage_path: path,
        model: attempt.model,
        status: attempt.status,
        result: attempt.result,
        error: attempt.error,
      });
      if (error) console.error('Couldn’t log the attempt', error);
    },
  );
  if (outcome.status === 'failed') {
    return fail(502, 'Couldn’t read receipts right now. Try again, or enter it by hand.');
  }
  return json({ ...outcome, scans_left: Math.max(limit - used - 1, 0) });
});
