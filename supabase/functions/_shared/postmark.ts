// Sending email through Postmark: sign-up codes for added addresses, and the reply to unknown
// senders. Best effort. Without POSTMARK_SERVER_TOKEN (local development) nothing is sent and
// the caller logs instead.

const API_URL = 'https://api.postmarkapp.com/email';

/** Sends a plain-text email from the receipts address. True if Postmark accepted it. */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const token = Deno.env.get('POSTMARK_SERVER_TOKEN');
  const from = Deno.env.get('RECEIPTS_EMAIL_ADDRESS');
  if (!token || !from) return false;
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: `Spendly <${from}>`,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        MessageStream: 'outbound',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.error('Postmark', response.status, await response.text());
    return response.ok;
  } catch (e) {
    console.error('Postmark', e);
    return false;
  }
}
