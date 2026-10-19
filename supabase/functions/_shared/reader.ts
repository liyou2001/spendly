// Which model reads receipts: Gemini or Claude, from the Edge Functions' environment.
//   RECEIPT_PROVIDER=gemini|claude picks one. Unset, Gemini is used if GEMINI_API_KEY is set,
//   otherwise Claude with ANTHROPIC_API_KEY.
import { askClaude, CLAUDE_MODELS } from './claude.ts';
import { askGemini, GEMINI_MODELS } from './gemini.ts';
import type { ReceiptContent } from './receipt.ts';

export interface ReceiptReader {
  provider: 'claude' | 'gemini';
  /** Tried in order until a draft adds up. */
  models: readonly string[];
  ask: (model: string, content: ReceiptContent, categories: readonly string[]) => Promise<unknown>;
}

/** The configured reader, or null when its API key isn't set. */
export function receiptReader(
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
): ReceiptReader | null {
  const provider = env('RECEIPT_PROVIDER') ?? (env('GEMINI_API_KEY') ? 'gemini' : 'claude');
  const ask = provider === 'gemini' ? askGemini : askClaude;
  const apiKey = env(provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY');
  if (!apiKey || (provider !== 'gemini' && provider !== 'claude')) return null;
  return {
    provider,
    models: provider === 'gemini' ? GEMINI_MODELS : CLAUDE_MODELS,
    ask: (model, content, categories) => ask({ apiKey, model, content, categories }),
  };
}
