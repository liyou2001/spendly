import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1.0.13';

import { pickContent } from './inbound.ts';
import { parseRawEmail } from './mime.ts';

const encode = (text: string) => new TextEncoder().encode(text.replaceAll('\n', '\r\n'));

const order = encode(`From: "Amazon.com" <auto-confirm@amazon.com>
To: leo@gmail.com
Subject: =?UTF-8?Q?Your_order_=E2=9C=93?=
Message-ID: <order-1@amazon.com>
Auto-Submitted: auto-generated
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary=b

--b
Content-Type: text/html; charset=utf-8

<table><tr><td>Desk lamp</td><td>$29.11</td></tr></table><p>Order total $29.11</p>
--b
Content-Type: application/pdf; name=receipt.pdf
Content-Disposition: attachment; filename=receipt.pdf
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--b--
`);

Deno.test('a raw email becomes its sender, subject, body, headers and attachments', async () => {
  const email = await parseRawEmail(order, 'leo+caf_=receipts=in.spendly.app@gmail.com');
  assertEquals(email.From, 'auto-confirm@amazon.com');
  assertEquals(email.EnvelopeFrom, 'leo+caf_=receipts=in.spendly.app@gmail.com');
  assertEquals(email.Subject, 'Your order ✓');
  assertEquals(email.TextBody, undefined);
  assertEquals(email.HtmlBody?.includes('Desk lamp'), true);
  assertEquals(email.Headers?.find((h) => h.Name === 'Auto-Submitted')?.Value, 'auto-generated');
  assertEquals(email.Attachments, [
    { Name: 'receipt.pdf', Content: 'JVBERi0xLjQK', ContentType: 'application/pdf' },
  ]);
  assertEquals(pickContent(email), { kind: 'pdf', base64: 'JVBERi0xLjQK' });
});

Deno.test('an HTML-only email is read as text', async () => {
  const html = encode(`From: leo@gmail.com
Subject: Fwd: order
Content-Type: text/html; charset=utf-8

<p>Desk lamp $29.11</p><p>Order total $29.11</p>
`);
  const content = pickContent(await parseRawEmail(html, 'leo@gmail.com'));
  assertEquals(content, {
    kind: 'text',
    text: 'Subject: Fwd: order\n\nDesk lamp $29.11\nOrder total $29.11',
  });
});

Deno.test('the same message from two forwarders is two emails; a retry is one', async () => {
  const leo = await parseRawEmail(order, 'leo@gmail.com');
  const again = await parseRawEmail(order, 'LEO@gmail.com');
  const maya = await parseRawEmail(order, 'maya@gmail.com');
  assertEquals(leo.MessageID, again.MessageID);
  assertNotEquals(leo.MessageID, maya.MessageID);
});
