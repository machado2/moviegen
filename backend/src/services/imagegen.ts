// Image generation through the LiteLLM gateway (OpenAI-compatible Images API).
//
// Replaces the codex CLI for API-mode generation: the gateway holds the real
// provider keys and is a wildcard config, so any image model id the user puts
// in Settings (gpt-image-1, dall-e-3, gemini-2.5-flash-image, …) is routed.
// When the quadro has reference images (character sheets) we use /images/edits
// so the model can keep identity consistent; otherwise /images/generations.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { LLM_BASE_URL } from '../config.js';
import { HttpError } from '../lib/errors.js';
import type { SpendRecord } from './spend.js';

// Image generation can legitimately take a couple of minutes on big models.
const IMAGE_TIMEOUT_MS = 5 * 60 * 1000;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export interface ImageGenResult {
  png: Buffer;
  spend: SpendRecord;
}

function parseCostHeader(res: Response): number | null {
  const raw = res.headers.get('x-litellm-response-cost');
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function readImageData(res: Response): Promise<Buffer> {
  const json = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const item = json.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new HttpError(502, `Could not fetch generated image (${img.status})`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new HttpError(502, 'Image gateway returned no image data');
}

async function failFromResponse(res: Response, model: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new HttpError(
    502,
    `Geração de imagem falhou no modelo "${model}" (${res.status}). Verifique o id do modelo nas Configurações.`,
    text ? [text.slice(0, 600)] : undefined,
  );
}

export interface GenerateImageInput {
  apiKey: string;
  model: string;
  prompt: string;
  /** Reference images (absolute paths) for identity consistency, if any. */
  attachmentPaths?: string[];
}

/** Generate one image via the gateway, returning the PNG bytes and the cost. */
export async function generateImageViaGateway(input: GenerateImageInput): Promise<ImageGenResult> {
  const { apiKey, model, prompt } = input;
  const attachments = input.attachmentPaths ?? [];
  const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);

  try {
    let res: Response;
    if (attachments.length > 0) {
      // Reference-conditioned generation: multipart /images/edits.
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      for (const p of attachments) {
        const buf = await fsp.readFile(p);
        const type = MIME[path.extname(p).toLowerCase()] ?? 'image/png';
        form.append('image[]', new Blob([buf], { type }), path.basename(p));
      }
      res = await fetch(`${LLM_BASE_URL}/images/edits`, {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } else {
      res = await fetch(`${LLM_BASE_URL}/images/generations`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, n: 1 }),
      });
    }

    if (!res.ok) await failFromResponse(res, model);
    const costUsd = parseCostHeader(res);
    const png = await readImageData(res);
    return { png, spend: { costUsd } };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new HttpError(504, `O modelo de imagem "${model}" não respondeu em ${IMAGE_TIMEOUT_MS / 60000} min.`);
    }
    throw new HttpError(502, `Image gateway request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
