// One call to the Gemini API (Google AI Studio) to read a receipt photo, as an alternative to
// Claude. The key stays on the server (Rule 9). On Google's free tier, what's sent may be used
// to improve Google's products, so use it for development with your own receipts only.
import { RECEIPT_SCHEMA, SYSTEM_PROMPT, userPrompt, type AskInput } from './receipt.ts';

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Flash-Lite first; Flash when Flash-Lite's draft doesn't add up. Both have a free tier. */
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'] as const;

type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
};

/**
 * The receipt schema in the form Gemini's responseSchema takes (an OpenAPI subset): upper-case
 * types, and "nullable" instead of a null type.
 */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const real = types.find((t) => t !== 'null');
  if (real) out.type = real.toUpperCase();
  if (types.includes('null')) out.nullable = true;
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;
  return out;
}

const RESPONSE_SCHEMA = toGeminiSchema(RECEIPT_SCHEMA as JsonSchema);

/**
 * Asks `model` to read the photo and returns the receipt record it wrote, unchecked
 * (parseReading checks it). The reply is constrained to the schema as JSON.
 */
export async function askGemini(input: AskInput): Promise<unknown> {
  const response = await (input.fetchImpl ?? fetch)(`${API_URL}/${input.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': input.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: { mimeType: input.mediaType ?? 'image/jpeg', data: input.imageBase64 },
            },
            { text: userPrompt(input.categories) },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
        maxOutputTokens: 8192,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Gemini ${input.model}: ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  }
  const reply = (await response.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
  };
  if (reply.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the photo: ${reply.promptFeedback.blockReason}`);
  }
  const candidate = reply.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('The reply was cut off');
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (!text) throw new Error(`No receipt in the reply (${candidate?.finishReason ?? 'no answer'})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The reply wasn’t valid JSON');
  }
}
