// scan-allowance: how many receipt scans you have left this month, for Add expense to show
// before you scan. The same count extract-receipt enforces (_shared/allowance.ts); signed in only.
import { adminClient, withinLimit } from '../_shared/admin.ts';
import { scanAllowance } from '../_shared/allowance.ts';
import { corsHeaders, fail, json, TOO_MANY } from '../_shared/http.ts';
import { receiptReader } from '../_shared/reader.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Use POST');

  const admin = adminClient();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return fail(401, 'Sign in first.');
  // The app asks on opening Add expense and after each scan; this is far above that.
  if (!(await withinLimit(admin, `allowance:user:${auth.user.id}`, 60, 60))) {
    return fail(429, TOO_MANY);
  }

  try {
    const allowance = await scanAllowance(admin, auth.user.id);
    return json({
      limit: allowance.limit,
      used: allowance.used,
      // Without a reader there's nothing to count down; scanning says it isn't set up.
      left: receiptReader() ? allowance.left : null,
      resets_on: allowance.resetsOn,
    });
  } catch (error) {
    console.error('Couldn’t count scans', error);
    return fail(500, 'Something went wrong. Try again.');
  }
});
