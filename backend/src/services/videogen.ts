// Video generation through the LiteLLM gateway (OpenAI-compatible /v1/videos).
//
// Unlike images, video generation is asynchronous: the gateway creates a job
// (POST /videos), which we poll (GET /videos/{id}) until it's `completed`, then
// download the bytes (GET /videos/{id}/content). Veo (via Gemini) is the routed
// path — model ids like "gemini/veo-3.0-generate-preview". The whole flow honors
// an AbortSignal so a cancelled job stops polling promptly.

import { LLM_BASE_URL } from '../config.js';
import { HttpError } from '../lib/errors.js';
import type { SpendRecord } from './spend.js';

// Veo operations typically take a few minutes; allow a generous ceiling.
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 8 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;

interface VideoObject {
  id: string;
  status: string; // queued | processing | in_progress | completed | failed
  progress?: number;
  error?: string | { message?: string } | null;
}

export interface VideoGenResult {
  mp4: Buffer;
  spend: SpendRecord;
}

export interface GenerateVideoInput {
  apiKey: string;
  /** Model id, e.g. "gemini/veo-3.0-generate-preview". */
  model: string;
  prompt: string;
  /** Duration in seconds (provider-capped; Veo ≈ 8s max). */
  seconds?: number;
  /** Frame size, e.g. "1280x720" → 16:9/720p. */
  size?: string;
  /** Cancellation from the surrounding job. */
  signal?: AbortSignal;
  /** Progress callback (0..1) while polling. */
  onProgress?: (fraction: number, message: string) => void;
}

function parseCostHeader(res: Response): number | null {
  const raw = res.headers.get('x-litellm-response-cost');
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function errorText(err: VideoObject['error']): string {
  if (!err) return 'erro desconhecido';
  if (typeof err === 'string') return err;
  return err.message ?? 'erro desconhecido';
}

async function failFromResponse(res: Response, model: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new HttpError(
    502,
    `Geração de vídeo falhou no modelo "${model}" (${res.status}). Verifique o id do modelo nas Configurações.`,
    text ? [text.slice(0, 600)] : undefined,
  );
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpError(499, 'Geração de vídeo cancelada.'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new HttpError(499, 'Geração de vídeo cancelada.'));
      },
      { once: true },
    );
  });

/** A short timeout signal merged with the caller's cancellation signal. */
function reqSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;
  // AbortSignal.any merges cancellation + per-request timeout.
  return AbortSignal.any([signal, timeout]);
}

/** Generate one video via the gateway: create → poll → download. */
export async function generateVideoViaGateway(input: GenerateVideoInput): Promise<VideoGenResult> {
  const { apiKey, model, prompt, seconds, size, signal, onProgress } = input;
  let costUsd: number | null = null;
  const auth = { Authorization: `Bearer ${apiKey}` };

  try {
    // 1) Create the video job.
    onProgress?.(0.1, `Criando geração de vídeo via ${model}…`);
    const body: Record<string, unknown> = { model, prompt };
    if (seconds != null) body.seconds = String(seconds);
    if (size) body.size = size;
    const createRes = await fetch(`${LLM_BASE_URL}/videos`, {
      method: 'POST',
      signal: reqSignal(signal),
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(body),
    });
    if (!createRes.ok) await failFromResponse(createRes, model);
    costUsd = parseCostHeader(createRes) ?? costUsd;
    const created = (await createRes.json()) as VideoObject;
    if (!created.id) throw new HttpError(502, 'O gateway não retornou um id de vídeo.');

    // 2) Poll until terminal.
    const startedAt = Date.now();
    let status = created.status;
    while (status !== 'completed') {
      if (status === 'failed') {
        throw new HttpError(502, `Geração de vídeo falhou: ${errorText(created.error)}`);
      }
      if (Date.now() - startedAt > VIDEO_TIMEOUT_MS) {
        throw new HttpError(504, `O modelo de vídeo "${model}" não terminou em ${VIDEO_TIMEOUT_MS / 60000} min.`);
      }
      await sleep(POLL_INTERVAL_MS, signal);
      const pollRes = await fetch(`${LLM_BASE_URL}/videos/${created.id}`, {
        method: 'GET',
        signal: reqSignal(signal),
        headers: auth,
      });
      if (!pollRes.ok) await failFromResponse(pollRes, model);
      costUsd = parseCostHeader(pollRes) ?? costUsd;
      const cur = (await pollRes.json()) as VideoObject;
      status = cur.status;
      created.error = cur.error;
      const pct = typeof cur.progress === 'number' ? Math.max(0, Math.min(100, cur.progress)) / 100 : null;
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      onProgress?.(
        pct != null ? 0.1 + pct * 0.8 : 0.5,
        `Renderizando vídeo (${status})${pct != null ? ` · ${Math.round(pct * 100)}%` : ''} · ${elapsed}s`,
      );
    }

    // 3) Download the bytes.
    onProgress?.(0.92, 'Baixando vídeo…');
    const contentRes = await fetch(`${LLM_BASE_URL}/videos/${created.id}/content`, {
      method: 'GET',
      signal: reqSignal(signal),
      headers: auth,
    });
    if (!contentRes.ok) await failFromResponse(contentRes, model);
    costUsd = parseCostHeader(contentRes) ?? costUsd;
    const mp4 = Buffer.from(await contentRes.arrayBuffer());
    if (mp4.byteLength === 0) throw new HttpError(502, 'O gateway retornou um vídeo vazio.');
    return { mp4, spend: { costUsd } };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new HttpError(504, `O modelo de vídeo "${model}" não respondeu a tempo.`);
    }
    throw new HttpError(502, `Falha na geração de vídeo: ${err instanceof Error ? err.message : String(err)}`);
  }
}
