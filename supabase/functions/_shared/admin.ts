// The service-role client. It bypasses row-level security, so these functions only call the
// link_* database functions, which return just what the payment page may show (Rule 5).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function adminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof adminClient>;

/** True if this hit is within the limit: at most `max` per `windowSeconds` for `key`. */
export async function withinLimit(
  admin: AdminClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc('hit_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(error);
    return false;
  }
  return data === true;
}
