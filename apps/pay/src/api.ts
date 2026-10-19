// Calls to the payment page's Edge Functions. The page has no database access of its own: the
// link token is sent to the functions, which return only what this person may see.

export interface ShareItem {
  name: string;
  /** The line's total, for all `quantity` of it. */
  amount_cents: number;
  quantity: number;
  /** How many people it's split between. */
  split_count: number;
  /** Tagged one by one: how many were yours, out of all of them (1 each when split evenly). */
  my_units: number;
  total_units: number;
}

export interface ShareExpense {
  merchant: string;
  expense_date: string;
  /** This person's share of it. */
  amount_cents: number;
  items: ShareItem[];
}

export interface SharePage {
  person_name: string;
  payer_name: string;
  group_name: string;
  /** What they owe the payer, net. Negative when the payer owes them. */
  owed_cents: number;
  /** "I paid" claims waiting for the payer to confirm. */
  pending_cents: number;
  handles: {
    venmo: string | null;
    paypal: string | null;
    cashtag: string | null;
    /** The email or US phone number their Zelle uses. */
    zelle: string | null;
  };
  texts_opted_in: boolean;
  /** The expenses behind what's owed now, newest first. */
  expenses: ShareExpense[];
  /** Older expenses, already paid off, that aren't listed. */
  earlier_count: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * The Supabase URL: VITE_SUPABASE_URL when set (hosted). In development it's left blank and the
 * page uses local Supabase on the computer serving it, so it also works from a phone on Wi-Fi.
 * A deployed page without it can't work, so that's an error rather than a guess.
 */
export function supabaseUrl(
  configured: string | undefined,
  location: { hostname: string },
  production: boolean,
): string {
  if (configured) return configured.replace(/\/$/, '');
  if (production) throw new ApiError('This page isn’t set up yet. Try again later.', 0);
  return `http://${location.hostname}:54321`;
}

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const base = supabaseUrl(
    import.meta.env.VITE_SUPABASE_URL,
    window.location,
    import.meta.env.PROD,
  );
  let response: Response;
  try {
    response = await fetch(`${base}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Couldn’t connect. Check your connection and try again.', 0);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(data.error ?? 'Something went wrong. Try again.', response.status);
  }
  return data as T;
}

export const getShare = (token: string) => call<SharePage>('get-share', { token });

export const claimPayment = (token: string, amountCents: number, method: string | null) =>
  call<{ ok: true }>('claim-payment', { token, amount_cents: amountCents, method });

export const flagProblem = (token: string, message: string) =>
  call<{ ok: true }>('flag-problem', { token, message });

export const setTextOptIn = (token: string, optIn: boolean, phone: string | null) =>
  call<{ opted_in: boolean }>('text-opt-in', { token, opt_in: optIn, phone });
