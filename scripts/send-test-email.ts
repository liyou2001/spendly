// Sends a sample forwarded receipt to the local postmark-inbound function, as Postmark would
// (Postmark can't reach your computer). Reads POSTMARK_INBOUND_SECRET from
// supabase/functions/.env.
//
//   npm run email:test -- you@example.com        # from an address on your Spendly account
//   npm run email:test -- you@example.com path/to/email.txt
//
// Then look under Needs you in the app.
const [from, file] = Deno.args;
if (!from) {
  console.error('Usage: npm run email:test -- <your address> [email text file]');
  Deno.exit(1);
}
const secret = Deno.env.get('POSTMARK_INBOUND_SECRET');
if (!secret) {
  console.error('Set POSTMARK_INBOUND_SECRET in supabase/functions/.env (any long random string).');
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

const response = await fetch(`${apiUrl}/functions/v1/postmark-inbound`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Basic ${btoa(`postmark:${secret}`)}`,
  },
  body: JSON.stringify({
    MessageID: `local-${crypto.randomUUID()}`,
    From: from,
    FromFull: { Email: from },
    Subject: 'Fwd: Your Amazon.com order',
    TextBody: text,
    // As if the sending server checked out for this address (SPF passed for its domain).
    Headers: [{ Name: 'Received-SPF', Value: `Pass (local test) envelope-from=${from}` }],
    Attachments: [],
  }),
});
console.log(response.status, await response.text());
console.log('Reading happens in the background; check Needs you in a few seconds.');
