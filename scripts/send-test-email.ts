// Sends a sample forwarded receipt to the local inbound-email function, as the Cloudflare Email
// Worker would (Cloudflare can't reach your computer). Reads INBOUND_SECRET from
// supabase/functions/.env.
//
//   npm run email:test -- you@example.com        # from an address on your Spendly account
//   npm run email:test -- you@example.com path/to/email.txt
//
// Then look under Needs you in the app. From an address not on any account, the reply lands in
// Mailpit (http://127.0.0.1:54324).
const [from, file] = Deno.args;
if (!from) {
  console.error('Usage: npm run email:test -- <your address> [email text file]');
  Deno.exit(1);
}
const secret = Deno.env.get('INBOUND_SECRET');
if (!secret) {
  console.error('Set INBOUND_SECRET in supabase/functions/.env (any long random string).');
  Deno.exit(1);
}
const apiUrl = Deno.env.get('API_URL') ?? 'http://127.0.0.1:54321';

const text = file
  ? await Deno.readTextFile(file)
  : `---------- Forwarded message ---------
From: Amazon.com <auto-confirm@amazon.com>
Subject: Your Amazon.com order of "USB-C cable" and 2 more items

Order Confirmation
Order placed: October 18, 2026

USB-C cable, 2 pack         $12.99
Desk lamp                    $29.11
Notebooks, 3 x $4.00         $12.00

Item(s) Subtotal:            $54.10
Estimated tax:                $4.33
Order Total:                 $58.43`;

const raw = [
  `From: ${from}`,
  'To: receipts@spendly.local',
  'Subject: Fwd: Your Amazon.com order',
  `Message-ID: <${crypto.randomUUID()}@spendly.local>`,
  `Date: ${new Date().toUTCString()}`,
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  text,
].join('\r\n');

const response = await fetch(`${apiUrl}/functions/v1/inbound-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'message/rfc822',
    'X-Inbound-Secret': secret,
    'X-Envelope-From': from,
    // Locally only: stands in for Cloudflare's check that the email really came from `from`.
    'X-Test-Sender': from,
  },
  body: raw,
});
console.log(response.status, await response.text());
console.log('Reading happens in the background; check Needs you in a few seconds.');
