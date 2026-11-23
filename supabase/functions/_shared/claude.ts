// One call to the Claude API to read a receipt photo. The key stays on the server (Rule 9).
import {
  fencedEmail,
  RECEIPT_SCHEMA,
  SYSTEM_PROMPT,
  userPrompt,
  type AskInput,
  type ReceiptContent,
} from './receipt.ts';

const API_URL = 'https://api.anthropic.com/v1/messages';

/** Haiku first; Sonnet when Haiku's draft doesn't add up. */
export const CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const;

/**
 * The one tool Claude calls. Its input is the receipt, copied line by line; `strict` keeps it in
 * the schema's shape.
 */
const RECEIPT_TOOL = {
  name: 'record_receipt',
  description:
    'Record what the receipt says, line by line. Copy each amount exactly as printed, in cents. Never add, subtract or correct amounts.',
  strict: true,
  input_schema: RECEIPT_SCHEMA,
};

/**
 * Asks for the tool call in words. Sonnet 5.5 rejects a request that forces one (tool_choice
 * "tool" or "any" is a 400), so the choice is left to the model and the prompt says what to do.
 */
const CLAUDE_SYSTEM_PROMPT = `${SYSTEM_PROMPT} Answer only by calling the ${RECEIPT_TOOL.name} tool, once, with no other text. If it isn’t a receipt or can’t be read, still call the tool, with readable set to false.`;

/** The receipt as a Claude content block: an image, a PDF document, or the email's text. */
function claudeBlock(content: ReceiptContent) {
  if (content.kind === 'image') {
    return {
      type: 'image',
      source: { type: 'base64', media_type: content.mediaType, data: content.base64 },
    };
  }
  if (content.kind === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: content.base64 },
    };
  }
  return { type: 'text', text: fencedEmail(content.text) };
}

/**
 * Asks `model` to read the receipt and returns the record_receipt tool's input, unchecked
 * (parseReading checks it). A reply without the tool call is an error, so the next model tries.
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
      system: CLAUDE_SYSTEM_PROMPT,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: [
        {
          role: 'user',
          content: [
            claudeBlock(input.content),
            { type: 'text', text: userPrompt(input.categories, input.content.kind) },
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
