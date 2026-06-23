import type { ParsedScript, Project } from '@mediagen/types';
import { DEFAULT_PARSE_MODEL, OPENROUTER_BASE } from '../config.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { validateParsedScript } from '../lib/validate.js';

function requireKey(project: Project): string {
  if (!project.openrouterApiKey) {
    throw badRequest('No OpenRouter API key configured for this project');
  }
  return project.openrouterApiKey;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: { jsonObject?: boolean } = {},
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://mediagen.local',
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
    throw new HttpError(502, `OpenRouter request failed (${res.status})`, text ? [text.slice(0, 500)] : undefined);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, 'OpenRouter returned no content');
  return content;
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
  const apiKey = requireKey(project);
  const model = project.parseModel || DEFAULT_PARSE_MODEL;
  const content = await chat(
    apiKey,
    model,
    [
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      { role: 'user', content: `Project language hint: ${project.language}\n\nScreenplay:\n\n${scriptMarkdown}` },
    ],
    { jsonObject: true },
  );

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
  const apiKey = requireKey(project);
  const model = project.parseModel || DEFAULT_PARSE_MODEL;
  const style = project.globalStyle ? `Global visual style: ${project.globalStyle}\n` : '';
  const content = await chat(apiKey, model, [
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
  return content.trim();
}
