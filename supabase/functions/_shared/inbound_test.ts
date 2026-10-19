import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  fromIsVerified,
  gmailForwardingCode,
  htmlToText,
  isAutomated,
  parseInbound,
  pickContent,
  verifiedSenders,
  type InboundEmail,
} from './inbound.ts';

const forwarded: InboundEmail = {
  MessageID: 'm-1',
  From: 'Leo <Leo@Example.com>',
  FromFull: { Email: 'Leo@Example.com' },
  Subject: 'Fwd: Your Amazon.com order',
  TextBody: 'Order total: $42.10\nItems: USB-C cable $12.99, Desk lamp $29.11',
  Headers: [
    {
      Name: 'Received-SPF',
      Value: 'Pass (sender SPF authorized) identity=mailfrom; envelope-from="leo@example.com"',
    },
  ],
};

Deno.test('Postmark’s JSON is read only if it’s an inbound email', () => {
  assertEquals(parseInbound(forwarded)?.MessageID, 'm-1');
  assertEquals(parseInbound({ From: 'x' }), null);
  assertEquals(parseInbound('nope'), null);
});

Deno.test('a From address is trusted only when SPF, DKIM or DMARC passed for its domain', () => {
  assertEquals(fromIsVerified(forwarded), true);
  assertEquals(verifiedSenders(forwarded, 'receipts@in.spendly.app'), ['leo@example.com']);

  const dkim: InboundEmail = {
    ...forwarded,
    From: 'leo@gmail.com',
    FromFull: { Email: 'leo@gmail.com' },
    Headers: [
      { Name: 'Authentication-Results', Value: 'mx.google.com; dkim=pass header.d=gmail.com' },
    ],
  };
  assertEquals(fromIsVerified(dkim), true);

  // A pass for the forger's own domain says nothing about the From line.
  const forged: InboundEmail = {
    ...forwarded,
    Headers: [
      { Name: 'Received-SPF', Value: 'Pass identity=mailfrom; envelope-from="x@evil.example"' },
      { Name: 'Authentication-Results', Value: 'mx; dkim=pass header.d=evil.example' },
    ],
  };
  assertEquals(fromIsVerified(forged), false);
  assertEquals(verifiedSenders(forged, undefined), ['x@evil.example']);

  const failed: InboundEmail = {
    ...forwarded,
    Headers: [{ Name: 'Received-SPF', Value: 'Fail; envelope-from="leo@example.com"' }],
  };
  assertEquals(verifiedSenders(failed, undefined), []);
});

Deno.test('a Gmail filter’s forward is matched by the envelope sender, never by headers', () => {
  const filtered: InboundEmail = {
    ...forwarded,
    From: 'Amazon.com <auto-confirm@amazon.com>',
    FromFull: { Email: 'auto-confirm@amazon.com' },
    Headers: [
      { Name: 'X-Forwarded-For', Value: 'victim@gmail.com receipts@in.spendly.app' },
      { Name: 'Received-SPF', Value: 'pass (google.com) envelope-from=leo@gmail.com' },
    ],
  };
  assertEquals(verifiedSenders(filtered, 'receipts@in.spendly.app'), ['leo@gmail.com']);
  assertEquals(fromIsVerified(filtered), false);
});

Deno.test('robots, lists and bounces never get an automatic reply', () => {
  assertEquals(isAutomated(forwarded), false);
  assertEquals(isAutomated({ ...forwarded, From: 'no-reply@shop.com' }), true);
  assertEquals(
    isAutomated({ ...forwarded, Headers: [{ Name: 'Auto-Submitted', Value: 'auto-replied' }] }),
    true,
  );
  assertEquals(
    isAutomated({ ...forwarded, Headers: [{ Name: 'Auto-Submitted', Value: 'no' }] }),
    false,
  );
});

Deno.test('Gmail’s forwarding confirmation gives its code and who asked', () => {
  const confirmation: InboundEmail = {
    MessageID: 'm-2',
    From: 'Gmail Team <forwarding-noreply@google.com>',
    Subject: '(#123456789) Gmail Forwarding Confirmation - Receive Mail from leo@gmail.com',
    TextBody:
      'Leo@Gmail.com has requested to automatically forward mail to your email address receipts@in.spendly.app.\nConfirmation code: 123456789',
  };
  assertEquals(gmailForwardingCode(confirmation), {
    code: '123456789',
    requester: 'leo@gmail.com',
  });
  assertEquals(gmailForwardingCode(forwarded), null);
});

Deno.test('HTML emails become readable text', () => {
  assertEquals(
    htmlToText(
      '<style>p{}</style><table><tr><td>USB-C cable</td><td>$12.99</td></tr></table><p>Total&nbsp;&amp; tax</p>',
    ),
    'USB-C cable\t$12.99\nTotal & tax',
  );
});

Deno.test('a PDF or photo attachment is read before the email’s text', () => {
  const withPdf: InboundEmail = {
    ...forwarded,
    Attachments: [
      { Name: 'logo.gif', Content: 'R0lG', ContentType: 'image/gif' },
      { Name: 'receipt.pdf', Content: 'JVBERi0=', ContentType: 'application/pdf' },
    ],
  };
  assertEquals(pickContent(withPdf), { kind: 'pdf', base64: 'JVBERi0=' });
  const text = pickContent(forwarded);
  assertEquals(text?.kind, 'text');
  assertEquals(
    text?.kind === 'text' && text.text.startsWith('Subject: Fwd: Your Amazon.com order'),
    true,
  );
  assertEquals(pickContent({ ...forwarded, TextBody: '', HtmlBody: '<p>Hi</p>' }), null);
});
