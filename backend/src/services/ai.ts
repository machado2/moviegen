import type { Project } from '@mediagen/types';
import { LLM_BASE_URL } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { getAiConfig } from '../services/settings.js';
import { assertUnderCap, recordSpend, type SpendRecord } from '../services/spend.js';
import { projectDir } from '../storage/filesystem.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResult {
  content: string;
  /** Per-call cost reported by the gateway, or null when it reported none. */
  spend: SpendRecord;
}

// The LiteLLM gateway returns the real dollar cost of a completion in this
// response header. Parse it defensively — a missing/blank/non-numeric value
// means "cost unknown", never zero.
function parseCostHeader(res: Response): number | null {
  const raw = res.headers.get('x-litellm-response-cost');
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Parsing a long screenplay can legitimately take minutes, but a stalled
// connection must not hang the job forever — cap it generously.
const CHAT_TIMEOUT_MS = 8 * 60 * 1000;

async function chat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: { jsonObject?: boolean; signal?: AbortSignal } = {},
): Promise<ChatResult> {
  // One timeout covers the whole exchange — connecting AND reading the (large)
  // response body. A slow model that dribbles the body must still be capped.
  // A caller-supplied signal (job cancellation) aborts it early too.
  const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'MovieGen',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(opts.jsonObject ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(502, `LLM gateway request failed (${res.status})`, text ? [text.slice(0, 500)] : undefined);
    }
    const costUsd = parseCostHeader(res);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, 'LLM gateway returned no content');
    return {
      content,
      spend: {
        costUsd,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new HttpError(
        504,
        `O modelo "${model}" não respondeu em ${CHAT_TIMEOUT_MS / 60000} min. Tente um modelo de parse mais rápido ou um roteiro menor.`,
      );
    }
    throw new HttpError(502, `LLM gateway request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Generate a detailed image-generation prompt for a character appearance or a
 * location, based on a textual description. The user copies this into an
 * external image generator (v1 does not call image APIs directly).
 */
export async function generateImagePrompt(
  project: Project,
  subject: string,
  kind: 'character' | 'location',
): Promise<string> {
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();
  const dir = projectDir(project.id);
  await assertUnderCap(dir, spendCapUsd);
  const style = project.globalStyle ? `Global visual style: ${project.globalStyle}\n` : '';
  const { content, spend } = await chat(apiKey, model, [
    {
      role: 'system',
      content:
        'You write vivid, concrete prompts for an image generation model. Output only the prompt text, one paragraph, no preamble.',
    },
    {
      role: 'user',
      content: `${style}Write an image generation prompt for this ${kind}:\n\n${subject}`,
    },
  ]);
  await recordSpend(dir, spend);
  return content.trim();
}
