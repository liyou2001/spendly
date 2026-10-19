import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { askClaude, CLAUDE_MODELS } from './claude.ts';
import { askGemini, GEMINI_MODELS, toGeminiSchema } from './gemini.ts';
import { receiptReader } from './reader.ts';
import {
  extractReceipt,
  mathGap,
  monthlyScanLimit,
  parseReading,
  RECEIPT_SCHEMA,
  toBase64,
  type Attempt,
} from './receipt.ts';

const MODELS = { first: 'first-model', retry: 'stronger-model' };

const TODAY = new Date('2026-10-19T12:00:00Z');

// The plan's Costco receipt, as a model would copy it.
const costco = {
  readable: true,
  merchant: 'Costco',
  date: '2026-10-17',
  items: [
    { name: 'Protein powder', amount_cents: 4799 },
    { name: 'Graphic tee', amount_cents: 1299 },
    { name: 'Granola bars', amount_cents: 702 },
    { name: 'Paper towels', amount_cents: 2299 },
    { name: 'Dish soap', amount_cents: 1149 },
    { name: 'Trash bags', amount_cents: 1052 },
    { name: 'Oat milk', amount_cents: 1249 },
    { name: 'Hummus', amount_cents: 899 },
    { name: 'Veggie chips', amount_cents: 552 },
  ],
  discounts: [],
  taxes: [],
  tip_cents: null,
  total_cents: 14000,
  category: 'Groceries',
};

Deno.test('the Costco receipt reads as 9 items adding up to $140.00', () => {
  const parsed = parseReading(costco, TODAY);
  assertEquals(parsed.ok && parsed.readable && parsed.receipt.items.length, 9);
  if (parsed.ok && parsed.readable) {
    assertEquals(parsed.receipt.total_cents, 14000);
    assertEquals(mathGap(parsed.receipt), 0);
  }
});

Deno.test('code adds up tax and discount lines; negative items count as discounts', () => {
  const parsed = parseReading(
    {
      readable: true,
      merchant: '  Target ',
      date: '2026-10-18',
      items: [
        { name: 'Lamp', amount_cents: 2500 },
        { name: 'Coupon', amount_cents: -300 },
      ],
      discounts: [{ name: 'Circle', amount_cents: 200 }],
      taxes: [150, 25],
      tip_cents: null,
      total_cents: 2175,
    },
    TODAY,
  );
  if (!parsed.ok || !parsed.readable) throw new Error('should parse');
  assertEquals(parsed.receipt.merchant, 'Target');
  assertEquals(parsed.receipt.items, [{ name: 'Lamp', quantity: 1, amount_cents: 2500 }]);
  assertEquals(parsed.receipt.discount_cents, 500);
  assertEquals(parsed.receipt.tax_cents, 175);
  assertEquals(mathGap(parsed.receipt), 0);
});

Deno.test('a "2 x Soft drink" line keeps its quantity and its printed total', () => {
  const parsed = parseReading(
    {
      ...costco,
      items: [
        { name: 'Soft drink', quantity: 2, amount_cents: 500, unit_price_cents: 250 },
        { name: 'Fries', quantity: 1, amount_cents: 400 },
      ],
      total_cents: 900,
    },
    TODAY,
  );
  if (!parsed.ok || !parsed.readable) throw new Error('should parse');
  assertEquals(parsed.receipt.items, [
    { name: 'Soft drink', quantity: 2, amount_cents: 500 },
    { name: 'Fries', quantity: 1, amount_cents: 400 },
  ]);
  assertEquals(mathGap(parsed.receipt), 0);
});

Deno.test('with only a unit price printed, code multiplies it by the quantity', () => {
  const parsed = parseReading(
    {
      ...costco,
      items: [{ name: 'Taco', quantity: 3, amount_cents: null, unit_price_cents: 325 }],
      total_cents: 975,
    },
    TODAY,
  );
  assertEquals(parsed.ok && parsed.readable && parsed.receipt.items, [
    { name: 'Taco', quantity: 3, amount_cents: 975 },
  ]);
});

Deno.test('a missing quantity is 1; a bad one is an error', () => {
  const parsed = parseReading(costco, TODAY);
  assertEquals(parsed.ok && parsed.readable && parsed.receipt.items[0]?.quantity, 1);
  for (const quantity of [0, 1.5, 1000, '2']) {
    const bad = { ...costco, items: [{ name: 'Soft drink', quantity, amount_cents: 500 }] };
    assertEquals(parseReading(bad, TODAY).ok, false);
  }
});

Deno.test('malformed amounts are errors, and odd dates are dropped', () => {
  assertEquals(parseReading({ ...costco, total_cents: 140.0 + 0.5 }, TODAY).ok, false);
  assertEquals(
    parseReading({ ...costco, items: [{ name: 'x', amount_cents: '12' }] }, TODAY).ok,
    false,
  );
  assertEquals(parseReading({ ...costco, items: [] }, TODAY).ok, false);
  assertEquals(parseReading({ ...costco, taxes: [-5] }, TODAY).ok, false);
  assertEquals(parseReading('nope', TODAY).ok, false);
  for (const date of ['2026-02-30', '2031-01-01', '1999-12-31', 'Oct 17']) {
    const parsed = parseReading({ ...costco, date }, TODAY);
    assertEquals(parsed.ok && parsed.readable && parsed.receipt.date, null);
  }
});

Deno.test('a blurry photo is reported as unreadable, with what’s wrong', () => {
  assertEquals(parseReading({ readable: false, problem: 'too blurry' }, TODAY), {
    ok: true,
    readable: false,
    problem: 'too blurry',
  });
});

/** Runs extractReceipt with canned replies per model, collecting what it records. */
async function run(replies: Partial<Record<string, unknown>>) {
  const recorded: Attempt[] = [];
  const outcome = await extractReceipt(
    [MODELS.first, MODELS.retry],
    (model) => {
      const reply = replies[model];
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    },
    (attempt) => {
      recorded.push(attempt);
      return Promise.resolve();
    },
    TODAY,
  );
  return { outcome, recorded: recorded.map((a) => [a.model, a.status]) };
}

Deno.test('a receipt that adds up is done after Haiku', async () => {
  const { outcome, recorded } = await run({ [MODELS.first]: costco });
  assertEquals(outcome.status, 'ok');
  assertEquals(recorded, [[MODELS.first, 'succeeded']]);
});

Deno.test('if Haiku’s lines don’t add up, Sonnet tries', async () => {
  const off = { ...costco, total_cents: 14100 };
  const { outcome, recorded } = await run({ [MODELS.first]: off, [MODELS.retry]: costco });
  assertEquals(outcome.status === 'ok' && outcome.model, MODELS.retry);
  assertEquals(recorded, [
    [MODELS.first, 'mismatch'],
    [MODELS.retry, 'succeeded'],
  ]);
});

Deno.test('if neither adds up, the closer draft comes back flagged', async () => {
  const { outcome } = await run({
    [MODELS.first]: { ...costco, total_cents: 15000 },
    [MODELS.retry]: { ...costco, total_cents: 14050 },
  });
  assertEquals(outcome.status === 'mismatch' && [outcome.model, outcome.gap_cents], [
    MODELS.retry,
    -50,
  ]);
});

Deno.test('a blurry photo ends as unreadable; an API outage as failed', async () => {
  const blurry = { readable: false, problem: 'too blurry' };
  const unreadable = await run({ [MODELS.first]: blurry, [MODELS.retry]: blurry });
  assertEquals(unreadable.outcome, { status: 'unreadable', problem: 'too blurry' });
  // Its own status, which the monthly scan count relies on.
  assertEquals(unreadable.recorded, [
    [MODELS.first, 'unreadable'],
    [MODELS.retry, 'unreadable'],
  ]);
  const down = new Error('Claude: 529 overloaded');
  const { outcome, recorded } = await run({ [MODELS.first]: down, [MODELS.retry]: down });
  assertEquals(outcome.status, 'failed');
  assertEquals(recorded, [
    [MODELS.first, 'failed'],
    [MODELS.retry, 'failed'],
  ]);
});

Deno.test('askClaude forces the receipt tool and returns its input', async () => {
  let sent: Record<string, unknown> = {};
  const fakeFetch = (_url: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(
      Response.json({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', name: 'record_receipt', input: costco }],
      }),
    );
  };
  const input = await askClaude({
    apiKey: 'test',
    model: CLAUDE_MODELS[0],
    imageBase64: toBase64(new Uint8Array([1, 2, 3])),
    categories: ['Groceries'],
    fetchImpl: fakeFetch as typeof fetch,
  });
  assertEquals(input, costco);
  assertEquals(sent.model, 'claude-haiku-5-5');
  assertEquals(sent.tool_choice, { type: 'tool', name: 'record_receipt' });
  assertEquals('thinking' in sent, false);
});

Deno.test('toBase64 matches btoa', () => {
  assertEquals(toBase64(new TextEncoder().encode('Costco')), btoa('Costco'));
});

Deno.test('askGemini sends the photo inline and asks for JSON in the receipt schema', async () => {
  let url = '';
  let sent: Record<string, unknown> = {};
  let headers: Headers = new Headers();
  const fakeFetch = (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    headers = new Headers(init?.headers);
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(
      Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { text: 'thinking about it', thought: true },
                { text: JSON.stringify(costco) },
              ],
            },
          },
        ],
      }),
    );
  };
  const input = await askGemini({
    apiKey: 'test-key',
    model: GEMINI_MODELS[0],
    imageBase64: 'AQID',
    categories: ['Groceries'],
    fetchImpl: fakeFetch as typeof fetch,
  });
  assertEquals(input, costco);
  assertEquals(
    url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  );
  assertEquals(headers.get('x-goog-api-key'), 'test-key');
  const contents = sent.contents as { parts: Record<string, unknown>[] }[];
  assertEquals(contents[0]?.parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'AQID' } });
  const config = sent.generationConfig as Record<string, unknown>;
  assertEquals(config.responseMimeType, 'application/json');
  assertEquals((config.responseSchema as { type: string }).type, 'OBJECT');
});

Deno.test('askGemini fails clearly on a cut-off, blocked or non-JSON reply', async () => {
  const replying = (body: unknown) => (() => Promise.resolve(Response.json(body))) as typeof fetch;
  const ask = (fetchImpl: typeof fetch) =>
    askGemini({ apiKey: 'k', model: 'm', imageBase64: '', categories: [], fetchImpl }).then(
      () => 'no error',
      (e: Error) => e.message,
    );
  assertEquals(
    await ask(replying({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })),
    'The reply was cut off',
  );
  assertEquals(
    await ask(replying({ promptFeedback: { blockReason: 'SAFETY' } })),
    'Gemini blocked the photo: SAFETY',
  );
  assertEquals(
    await ask(replying({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })),
    'The reply wasn’t valid JSON',
  );
  const quota = (() =>
    Promise.resolve(new Response('quota exceeded', { status: 429 }))) as typeof fetch;
  assertEquals(await ask(quota), 'Gemini m: 429 quota exceeded');
});

Deno.test('Gemini’s schema asks for quantities too', () => {
  const schema = toGeminiSchema(RECEIPT_SCHEMA) as {
    properties: { items: { items: { properties: Record<string, { type: string }> } } };
  };
  assertEquals(schema.properties.items.items.properties.quantity?.type, 'INTEGER');
});

Deno.test('the schema converts to Gemini’s form: upper-case types, nullable for null', () => {
  assertEquals(
    toGeminiSchema({
      type: 'object',
      properties: {
        merchant: { type: ['string', 'null'], description: 'Store' },
        taxes: { type: 'array', items: { type: 'integer' } },
      },
      required: ['taxes'],
    }),
    {
      type: 'OBJECT',
      properties: {
        merchant: { type: 'STRING', nullable: true, description: 'Store' },
        taxes: { type: 'ARRAY', items: { type: 'INTEGER' } },
      },
      required: ['taxes'],
    },
  );
});

Deno.test(
  'the reader is Gemini when its key is set, unless RECEIPT_PROVIDER says otherwise',
  () => {
    const env = (values: Record<string, string>) => (name: string) => values[name];
    assertEquals(receiptReader(env({ GEMINI_API_KEY: 'g' }))?.models, GEMINI_MODELS);
    assertEquals(receiptReader(env({ ANTHROPIC_API_KEY: 'a' }))?.models, CLAUDE_MODELS);
    assertEquals(
      receiptReader(
        env({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', RECEIPT_PROVIDER: 'claude' }),
      )?.provider,
      'claude',
    );
    assertEquals(receiptReader(env({ RECEIPT_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a' })), null);
    assertEquals(receiptReader(env({})), null);
  },
);

Deno.test('the monthly scan limit falls back to 50 unless set to a whole number', () => {
  assertEquals(monthlyScanLimit('20'), 20);
  assertEquals(monthlyScanLimit('0'), 0);
  for (const bad of [undefined, '', 'fifty', '12.5', '-3']) assertEquals(monthlyScanLimit(bad), 50);
});
