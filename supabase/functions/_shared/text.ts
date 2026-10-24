// sendText(): every text Spendly sends goes through here (Rule 8). It only texts a number whose
// owner opted in themselves and hasn't replied STOP, never at night, names the app, and says how
// to opt out in the first text after someone opts in. SMS_PROVIDER picks how it's sent:
//   log     Nothing is sent; the text is saved to outbound_messages as "logged". The default.
//   twilio  Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).
//   telnyx  Telnyx (TELNYX_API_KEY, TELNYX_FROM_NUMBER).
import type { AdminClient } from './admin.ts';

export interface TextMessage {
  /** E.164, e.g. +16085550123. */
  to: string;
  body: string;
  /** The recipient's time zone if known; otherwise it must be daytime across the US. */
  timeZone: string | null;
}

export type TextResult =
  | { status: 'sent' | 'logged'; id: string }
  | { status: 'failed'; id: string; error: string }
  | { status: 'refused'; reason: 'no_consent' | 'night' };

export interface TextStore {
  /** When this number's owner opted in, or null if they haven't or replied STOP since. */
  consentedAt(phone: string): Promise<string | null>;
  /** Whether this number has been texted since then. */
  textedSince(phone: string, since: string): Promise<boolean>;
  /** Saves the text to outbound_messages and returns its id. */
  record(row: {
    to_phone: string;
    body: string;
    status: 'logged' | 'sent' | 'failed';
    provider_id?: string;
    error?: string;
  }): Promise<string>;
}

/** Hands the text to the provider and returns its id for the message. */
export type Transport = (to: string, body: string) => Promise<string>;

type Env = (name: string) => string | undefined;

/** Between 9am and 9pm there; without a time zone, in both New York and Los Angeles. */
export function isDaytime(timeZone: string | null, at: Date): boolean {
  const zones = timeZone ? [timeZone] : ['America/New_York', 'America/Los_Angeles'];
  return zones.every((zone) => {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: zone,
      }).format(at),
    );
    return hour >= 9 && hour < 21;
  });
}

/** The text as sent: named for the app, and with how to opt out the first time. */
export function textBody(body: string, first: boolean): string {
  return `Spendly: ${body}${first ? ' Reply STOP to opt out.' : ''}`;
}

/** A sendText that saves to `store` and sends with `transport` (null: only log). */
export function textSender(
  store: TextStore,
  transport: Transport | null,
  now: () => Date = () => new Date(),
) {
  return async (message: TextMessage): Promise<TextResult> => {
    const consentedAt = await store.consentedAt(message.to);
    if (!consentedAt) return { status: 'refused', reason: 'no_consent' };
    if (!isDaytime(message.timeZone, now())) return { status: 'refused', reason: 'night' };

    const body = textBody(message.body, !(await store.textedSince(message.to, consentedAt)));
    if (!transport) {
      return {
        status: 'logged',
        id: await store.record({ to_phone: message.to, body, status: 'logged' }),
      };
    }
    try {
      const providerId = await transport(message.to, body);
      const id = await store.record({
        to_phone: message.to,
        body,
        status: 'sent',
        provider_id: providerId,
      });
      return { status: 'sent', id };
    } catch (e) {
      const error = String(e).slice(0, 500);
      console.error('Text failed', error);
      return {
        status: 'failed',
        id: await store.record({ to_phone: message.to, body, status: 'failed', error }),
        error,
      };
    }
  };
}

async function sendOrThrow(provider: string, response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`${provider} ${response.status}: ${await response.text()}`);
  return response.json();
}

/** The provider SMS_PROVIDER names, or null to only log. */
export function transportFromEnv(
  env: Env = (name) => Deno.env.get(name),
  fetchImpl: typeof fetch = fetch,
): Transport | null {
  const provider = env('SMS_PROVIDER')?.trim() || 'log';
  if (provider === 'twilio') {
    return async (to, body) => {
      const sid = env('TWILIO_ACCOUNT_SID');
      const token = env('TWILIO_AUTH_TOKEN');
      const from = env('TWILIO_FROM_NUMBER');
      if (!sid || !token || !from) throw new Error('Twilio isn’t set up');
      const response = await fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: from, Body: body }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      return ((await sendOrThrow('Twilio', response)) as { sid: string }).sid;
    };
  }
  if (provider === 'telnyx') {
    return async (to, body) => {
      const key = env('TELNYX_API_KEY');
      const from = env('TELNYX_FROM_NUMBER');
      if (!key || !from) throw new Error('Telnyx isn’t set up');
      const response = await fetchImpl('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, text: body }),
        signal: AbortSignal.timeout(15_000),
      });
      return ((await sendOrThrow('Telnyx', response)) as { data: { id: string } }).data.id;
    };
  }
  return null;
}

/** sms_consents and outbound_messages. */
export function liveTextStore(admin: AdminClient): TextStore {
  return {
    consentedAt: async (phone) => {
      const { data, error } = await admin
        .from('sms_consents')
        .select('consented_at')
        .eq('phone', phone)
        .is('revoked_at', null)
        .order('consented_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.consented_at ?? null;
    },
    textedSince: async (phone, since) => {
      const { count, error } = await admin
        .from('outbound_messages')
        .select('id', { count: 'exact', head: true })
        .eq('to_phone', phone)
        .in('status', ['sent', 'logged'])
        .gte('created_at', since);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    record: async (row) => {
      const { data, error } = await admin
        .from('outbound_messages')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) throw error ?? new Error('No message saved');
      return data.id;
    },
  };
}

/** Sends a text, following every rule above. */
export function sendText(admin: AdminClient, message: TextMessage): Promise<TextResult> {
  return textSender(liveTextStore(admin), transportFromEnv())(message);
}
