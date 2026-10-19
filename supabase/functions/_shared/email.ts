// Sending email: codes for added addresses, and the reply to unknown senders. Best effort; the
// caller logs what wasn't sent. EMAIL_PROVIDER picks the service:
//   resend   Resend's API (RESEND_API_KEY, EMAIL_FROM). The default when RESEND_API_KEY is set.
//   mailpit  The local Supabase stack's Mailpit (http://127.0.0.1:54324). The default locally.
//   log      Nothing is sent.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

type Env = (name: string) => string | undefined;

/** A setting, with blank (KEY= in an env file) the same as unset. */
const setting = (env: Env, name: string) => env(name)?.trim() || undefined;

/** Whether these functions run in the local Supabase stack. */
export function isLocalStack(env: Env = (name) => Deno.env.get(name)): boolean {
  return /^http:\/\/(kong|localhost|127\.0\.0\.1|host\.docker\.internal)(:|\/|$)/.test(
    env('SUPABASE_URL') ?? '',
  );
}

function provider(env: Env): 'resend' | 'mailpit' | 'log' {
  const chosen = setting(env, 'EMAIL_PROVIDER');
  if (chosen === 'resend' || chosen === 'mailpit' || chosen === 'log') return chosen;
  if (setting(env, 'RESEND_API_KEY')) return 'resend';
  return isLocalStack(env) ? 'mailpit' : 'log';
}

/** "Spendly <hello@spendly.app>" → its name and address. */
function parseFrom(from: string): { Email: string; Name?: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return match?.[2]
    ? { Email: match[2], ...(match[1] ? { Name: match[1] } : {}) }
    : { Email: from.trim() };
}

/** A sendEmail for this environment. True if the service accepted the message. */
export function emailSender(env: Env = (name) => Deno.env.get(name), fetchImpl = fetch) {
  return async (message: EmailMessage): Promise<boolean> => {
    const service = provider(env);
    const from = setting(env, 'EMAIL_FROM') ?? 'Spendly <no-reply@spendly.local>';
    let request: [string, RequestInit];
    if (service === 'resend') {
      const key = setting(env, 'RESEND_API_KEY');
      if (!key || !setting(env, 'EMAIL_FROM')) {
        console.error('Resend needs RESEND_API_KEY and EMAIL_FROM');
        return false;
      }
      request = [
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
        },
      ];
    } else if (service === 'mailpit') {
      request = [
        `${setting(env, 'MAILPIT_URL') ?? 'http://inbucket:8025'}/api/v1/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: parseFrom(from),
            To: [{ Email: message.to }],
            Subject: message.subject,
            Text: message.text,
          }),
        },
      ];
    } else {
      return false;
    }
    try {
      const response = await fetchImpl(request[0], {
        ...request[1],
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) console.error(service, response.status, await response.text());
      else await response.body?.cancel();
      return response.ok;
    } catch (e) {
      console.error(service, e);
      return false;
    }
  };
}

export const sendEmail = (message: EmailMessage) => emailSender()(message);
