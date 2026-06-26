// Model catalog for the Settings UI: lets the user search/validate model slugs
// instead of typing blind. The LiteLLM gateway is a wildcard proxy (can't list
// its own models), but it forwards to OpenRouter, whose public catalog has ids,
// modalities and pricing — so that's the source. Cached in memory with a TTL so
// the Settings panel doesn't hit the upstream on every open.

import type { ModelCatalogEntry } from '@mediagen/types';
import { MODELS_CATALOG_URL } from '../config.js';
import { HttpError } from '../lib/errors.js';

const TTL_MS = 60 * 60 * 1000; // 1h — the catalog changes slowly.
const FETCH_TIMEOUT_MS = 15 * 1000;

let cache: { at: number; entries: ModelCatalogEntry[] } | null = null;

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number | null;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: Record<string, string | undefined>;
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  // OpenRouter uses "0" for free and "-1" for variable (e.g. auto-router).
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toEntry(m: RawModel): ModelCatalogEntry | null {
  if (!m.id) return null;
  const arch = m.architecture ?? {};
  const p = m.pricing ?? {};
  return {
    id: m.id,
    name: m.name ?? m.id,
    inputModalities: arch.input_modalities ?? [],
    outputModalities: arch.output_modalities ?? [],
    contextLength: typeof m.context_length === 'number' ? m.context_length : null,
    pricing: {
      prompt: num(p.prompt),
      completion: num(p.completion),
      image: num(p.image),
      request: num(p.request),
    },
  };
}

/** The model catalog, cached. Throws (502) only when there's no cache to fall back on. */
export async function getModelCatalog(): Promise<ModelCatalogEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.entries;
  try {
    const res = await fetch(MODELS_CATALOG_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = (await res.json()) as { data?: RawModel[] };
    const entries = (json.data ?? [])
      .map(toEntry)
      .filter((e): e is ModelCatalogEntry => e !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
    cache = { at: Date.now(), entries };
    return entries;
  } catch (err) {
    // Serve a stale cache if we have one — better than breaking Settings.
    if (cache) return cache.entries;
    throw new HttpError(502, `Não foi possível carregar o catálogo de modelos: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Estimate the USD cost of a completion from catalog pricing. Needed for
 * streaming responses, where the gateway can't report the real cost in a
 * response header (headers flush before the body completes). Best-effort:
 * returns null when the model isn't in the catalog or pricing is unknown.
 */
export async function estimateCostUsd(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
): Promise<number | null> {
  if (!inputTokens && !outputTokens) return null;
  try {
    const entry = (await getModelCatalog()).find((e) => e.id === model);
    if (!entry) return null;
    const cost = (inputTokens ?? 0) * (entry.pricing.prompt ?? 0) + (outputTokens ?? 0) * (entry.pricing.completion ?? 0);
    return cost > 0 ? cost : null;
  } catch {
    return null;
  }
}
