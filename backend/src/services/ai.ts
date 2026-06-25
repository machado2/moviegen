import type { ParsedScript, Project } from '@mediagen/types';
import { LLM_BASE_URL } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { getAiConfig } from '../services/settings.js';
import { assertUnderCap, recordSpend, type SpendRecord } from '../services/spend.js';
import { projectDir } from '../storage/filesystem.js';
import { validateParsedScript } from '../lib/validate.js';

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
  opts: { jsonObject?: boolean } = {},
): Promise<ChatResult> {
  // One timeout covers the whole exchange — connecting AND reading the (large)
  // response body. A slow model that dribbles the body must still be capped.
  const signal = AbortSignal.timeout(CHAT_TIMEOUT_MS);
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

function extractJson(raw: string): unknown {
  // Models sometimes wrap JSON in ```json fences or prose. Be forgiving.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = fenced ? fenced[1]! : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const slice = start !== -1 && end !== -1 ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(slice);
}

const PARSE_SYSTEM_PROMPT = `You are a film pre-production assistant. You convert a markdown screenplay into a strict JSON structure for an AI video production pipeline.

Rules:
- Extract every character with a "voiceDescription" suitable for TTS prompt generation (tone, age, accent, pace).
- Break each scene into shots of AT MOST 15 seconds each. Each shot is a single camera idea.
- For each shot, write "camera" (one camera idea), "action" (what is seen, for a video generator), and "exit" (the event that ends/transitions the shot).
- Identify which characters appear in each shot via "characterIds".
- Extract dialogue and voice-over into "lines" with {speaker, type, text}. speaker is a character id or "narrator". type is "dialogue" or "voice-over".
- Put on-screen story-world text in "diegeticTexts" and sound descriptions in "sounds".
- Character ids are lowercase slugs (e.g. "dr-euclides" -> "euclides" is fine as long as consistent).

Respond with a SINGLE JSON object matching exactly this TypeScript type, no commentary:

interface ParsedScript {
  title: string;
  language: string;        // BCP-47
  globalStyle: string;     // overall visual style
  characters: { id: string; name: string; description: string; voiceDescription: string }[];
  scenes: {
    number: number;
    shortTitle: string;
    slugTitle: string;     // screenplay slug line
    summary: string;
    continuityIn: string;
    continuityOut: string;
    shots: {
      order: number;
      camera: string;
      targetDuration: string;  // e.g. "12s", max "15s"
      action: string;
      exit: string;
      diegeticTexts: string[];
      sounds: string[];
      lines: { speaker: string; type: "dialogue" | "voice-over"; text: string }[];
      characterIds: string[];
    }[];
  }[];
}`;

export async function parseScript(project: Project, scriptMarkdown: string): Promise<ParsedScript> {
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();
  const dir = projectDir(project.id);
  await assertUnderCap(dir, spendCapUsd);
  const { content, spend } = await chat(
    apiKey,
    model,
    [
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      { role: 'user', content: `Project language hint: ${project.language}\n\nScreenplay:\n\n${scriptMarkdown}` },
    ],
    { jsonObject: true },
  );
  await recordSpend(dir, spend);

  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    throw new HttpError(502, 'Model did not return valid JSON');
  }
  const errors = validateParsedScript(parsed);
  if (errors.length) {
    throw new HttpError(502, 'Parsed script did not match the expected format', errors.slice(0, 20));
  }
  return parsed as ParsedScript;
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
