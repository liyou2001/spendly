// One call to the Claude API to read a receipt photo. The key stays on the server (Rule 9).
import { RECEIPT_SCHEMA, SYSTEM_PROMPT, userPrompt, type AskInput } from './receipt.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';

/** Haiku first; Sonnet when Haiku's draft doesn't add up. */
export const CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const;

/** The one tool Claude must call. Its input is the receipt, copied line by line. */
const RECEIPT_TOOL = {
  name: 'record_receipt',
  description:
    'Record what the receipt says, line by line. Copy each amount exactly as printed, in cents. Never add, subtract or correct amounts.',
  input_schema: RECEIPT_SCHEMA,
};

/**
 * Asks `model` to read the photo and returns the record_receipt tool's input, unchecked
 * (parseReading checks it). Tool use is forced and extended thinking is off, so the reply is
 * just the structured receipt.
 */
export async function askClaude(input: AskInput): Promise<unknown> {
  const response = await (input.fetchImpl ?? fetch)(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: 'tool', name: RECEIPT_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: input.mediaType ?? 'image/jpeg',
                data: input.imageBase64,
              },
            },
            { type: 'text', text: userPrompt(input.categories) },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Claude ${input.model}: ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  }
  const reply = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; name?: string; input?: unknown }[];
  };
  if (reply.stop_reason === 'max_tokens') throw new Error('The reply was cut off');
  const call = reply.content?.find(
    (block) => block.type === 'tool_use' && block.name === RECEIPT_TOOL.name,
  );
  if (!call) throw new Error('No receipt in the reply');
  return call.input;
}
