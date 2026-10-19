import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  fromIsVerified,
  gmailForwardingCode,
  htmlToText,
  isAutomated,
  pickContent,
  sentByFrom,
  verifiedSenders,
  type InboundEmail,
} from './inbound.ts';

const forwarded: InboundEmail = {
  MessageID: 'm-1',
  From: 'Leo@Example.com',
  Subject: 'Fwd: Your Amazon.com order',
  TextBody: 'Order total: $42.10\nItems: USB-C cable $12.99, Desk lamp $29.11',
  Auth: [{ method: 'spf', domain: 'example.com', address: 'leo@example.com' }],
};

Deno.test('a From address is trusted only when SPF, DKIM or DMARC passed for its domain', () => {
  assertEquals(fromIsVerified(forwarded), true);
  assertEquals(verifiedSenders(forwarded, 'receipts@in.spendly.app'), ['leo@example.com']);

  const dkim: InboundEmail = {
    ...forwarded,
    From: 'leo@gmail.com',
    Auth: [{ method: 'dkim', domain: 'gmail.com', address: null }],
  };
  assertEquals(fromIsVerified(dkim), true);
  assertEquals(verifiedSenders(dkim, undefined), ['leo@gmail.com']);

  // A pass for the forger's own domain says nothing about the From line.
  const forged: InboundEmail = {
    ...forwarded,
    Auth: [
      { method: 'spf', domain: 'evil.example', address: 'x@evil.example' },
      { method: 'dkim', domain: 'evil.example', address: null },
    ],
  };
  assertEquals(fromIsVerified(forged), false);
  assertEquals(verifiedSenders(forged, undefined), ['x@evil.example']);

  assertEquals(verifiedSenders({ ...forwarded, Auth: [] }, undefined), []);
});

Deno.test('headers in the email are never trusted, only what was verified', () => {
  const claims: InboundEmail = {
    ...forwarded,
    From: 'victim@gmail.com',
    Headers: [
      { Name: 'Received-SPF', Value: 'Pass envelope-from=victim@gmail.com' },
      { Name: 'Authentication-Results', Value: 'mx.google.com; dkim=pass header.d=gmail.com' },
      {
        Name: 'ARC-Authentication-Results',
        Value: 'i=1; mx.cloudflare.net; spf=pass smtp.mailfrom=victim@gmail.com',
      },
      { Name: 'X-Forwarded-For', Value: 'victim@gmail.com receipts@in.spendly.app' },
    ],
    Auth: [],
  };
  assertEquals(fromIsVerified(claims), false);
  assertEquals(verifiedSenders(claims, undefined), []);
});

Deno.test('a Gmail filter’s forward is matched by the envelope sender', () => {
  const filtered: InboundEmail = {
    ...forwarded,
    From: 'auto-confirm@amazon.com',
    Auth: [
      { method: 'dkim', domain: 'amazon.com', address: null },
      {
        method: 'spf',
        domain: 'gmail.com',
        address: 'leo+caf_=receipts=in.spendly.app@gmail.com',
      },
    ],
  };
  assertEquals(verifiedSenders(filtered, 'receipts@in.spendly.app'), [
    'auto-confirm@amazon.com',
    'leo@gmail.com',
  ]);
});

Deno.test('only a verified From that also sent it itself is the sender to reply to', () => {
  assertEquals(sentByFrom({ ...forwarded, EnvelopeFrom: 'LEO@example.com' }), true);
  // A Gmail filter passing on a store's email: the store's From is genuine, but not the sender.
  assertEquals(
    sentByFrom({
      ...forwarded,
      From: 'auto-confirm@amazon.com',
      EnvelopeFrom: 'leo+caf_=receipts=in.spendly.app@gmail.com',
      Auth: [{ method: 'dkim', domain: 'amazon.com', address: null }],
    }),
    false,
  );
  assertEquals(sentByFrom({ ...forwarded, EnvelopeFrom: 'leo@example.com', Auth: [] }), false);
  assertEquals(sentByFrom(forwarded), false);
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
    From: 'forwarding-noreply@google.com',
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
