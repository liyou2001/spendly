// Cloudflare Email Worker: Email Routing hands it every email sent to the receipts address, and
// it posts the raw message to the inbound-email Edge Function. It reads nothing itself (free
// Workers get very little CPU time); checking and reading happen in the function.

export interface Env {
  /** https://<project-ref>.supabase.co/functions/v1/inbound-email */
  INBOUND_URL: string;
  /** The same INBOUND_SECRET the function has. */
  INBOUND_SECRET: string;
}

/** The parts of Cloudflare's ForwardableEmailMessage this uses. */
export interface IncomingEmail {
  /** The envelope sender (SMTP MAIL FROM). */
  readonly from: string;
  /** The envelope recipient. */
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
}

/** The request to the function for one email. */
export async function inboundRequest(message: IncomingEmail, env: Env): Promise<Request> {
  return new Request(env.INBOUND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'message/rfc822',
      'X-Inbound-Secret': env.INBOUND_SECRET,
      'X-Envelope-From': message.from,
      'X-Envelope-To': message.to,
    },
    body: await new Response(message.raw).arrayBuffer(),
  });
}

export default {
  async email(message: IncomingEmail, env: Env): Promise<void> {
    const response = await fetch(await inboundRequest(message, env));
    // Failing here shows in the Worker's logs and tells the sending server it didn't go through.
    if (!response.ok) {
      throw new Error(`inbound-email answered ${response.status}: ${await response.text()}`);
    }
  },
};
