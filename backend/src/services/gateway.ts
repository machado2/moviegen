// Shared metered gateway for the agentic features (parse + co-creation).
//
// Both build a Vercel AI SDK provider that points at the LiteLLM gateway, and
// both need the same two project-specific concerns wrapped around it: capture
// the real dollar cost the gateway reports per response, and abort the run the
// moment the accumulated cost crosses the project's spend cap. This centralises
// that so the agents only worry about their tools and prompts.

import { createOpenAICompatible, type OpenAICompatibleProvider } from '@ai-sdk/openai-compatible';
import { LLM_BASE_URL } from '../config.js';

// The gateway reports the real dollar cost of each call in this response header.
// Parse defensively — missing/blank/non-numeric means "cost unknown", never zero.
export function parseCostHeader(headers: Headers): number | null {
  const raw = headers.get('x-litellm-response-cost');
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface MeteredGateway {
  /** The AI SDK provider — call with a model id to get a language model. */
  provider: OpenAICompatibleProvider;
  /** Dollars spent so far in this run (sum of per-response cost headers). */
  runSpend(): number;
  /** Whether the run was aborted because the spend cap was reached. */
  capHit(): boolean;
  /** Aborts when the cap is crossed — combine into the call's abortSignal. */
  capSignal: AbortSignal;
}

export function makeMeteredGateway(opts: {
  apiKey: string;
  /** Spend already on the project's ledger before this run. */
  priorSpend: number;
  /** The cap in USD, or null for no cap. */
  spendCapUsd: number | null;
}): MeteredGateway {
  let runSpend = 0;
  let capHit = false;
  const capController = new AbortController();

  const provider = createOpenAICompatible({
    name: 'litellm',
    baseURL: LLM_BASE_URL,
    apiKey: opts.apiKey,
    headers: { 'X-Title': 'MovieGen' },
    includeUsage: true,
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      const cost = parseCostHeader(res.headers);
      if (cost != null) {
        runSpend += cost;
        if (opts.spendCapUsd != null && opts.priorSpend + runSpend >= opts.spendCapUsd && !capHit) {
          capHit = true;
          capController.abort();
        }
      }
      return res;
    },
  });

  return {
    provider,
    runSpend: () => runSpend,
    capHit: () => capHit,
    capSignal: capController.signal,
  };
}
