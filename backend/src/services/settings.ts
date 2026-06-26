import path from 'node:path';
import type { AppSettingsDTO } from '@mediagen/types';
import { DATA_DIR, DEFAULT_PARSE_MODEL, DEFAULT_TTS_MODEL, LLM_API_KEY } from '../config.js';
import * as fs from '../storage/filesystem.js';
import { badRequest } from '../lib/errors.js';

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.ncl');

interface Settings {
  llmApiKey?: string | null;
  parseModel?: string;
  ttsModel?: string;
  spendCapUsd?: number | null;
  llmModels?: string[];
  imageModels?: string[];
  videoModels?: string[];
}

/** Normalize a spend cap: a finite, non-negative number, else null (no cap). */
function normalizeCap(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Clean a model shortlist: trimmed, non-empty, de-duplicated, order kept (first = default). */
function normalizeModelList(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const m = String(raw).trim();
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/** Resolved gateway key: the deploy-injected env wins, else the stored one. */
function resolveApiKey(stored: string | null | undefined): string | null {
  return LLM_API_KEY || stored || null;
}

function apiKeyHint(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 4) return '…' + '•'.repeat(key.length);
  return '…' + key.slice(-4);
}

async function read(): Promise<Settings> {
  if (!(await fs.pathExists(SETTINGS_FILE))) return {};
  return fs.readNickel<Settings>(SETTINGS_FILE);
}

export async function getSettings(): Promise<AppSettingsDTO> {
  const s = await read();
  const key = resolveApiKey(s.llmApiKey);
  return {
    hasApiKey: Boolean(key),
    apiKeyHint: apiKeyHint(key),
    // A key supplied via the LLM_API_KEY env can't be changed from the UI.
    apiKeyFromEnv: Boolean(LLM_API_KEY),
    parseModel: s.parseModel || DEFAULT_PARSE_MODEL,
    ttsModel: s.ttsModel || DEFAULT_TTS_MODEL,
    spendCapUsd: normalizeCap(s.spendCapUsd),
    llmModels: normalizeModelList(s.llmModels),
    imageModels: normalizeModelList(s.imageModels),
    videoModels: normalizeModelList(s.videoModels),
  };
}

export async function getAiConfig(): Promise<{
  apiKey: string;
  parseModel: string;
  ttsModel: string;
  spendCapUsd: number | null;
  llmModels: string[];
  imageModels: string[];
  videoModels: string[];
}> {
  const s = await read();
  const apiKey = resolveApiKey(s.llmApiKey);
  if (!apiKey) {
    throw badRequest('No LLM gateway key configured. Set the LLM_API_KEY env var or add it in Settings.');
  }
  const llmModels = normalizeModelList(s.llmModels);
  // Parse/co-creation model: explicit choice wins, else the first curated LLM, else the default.
  const parseModel = s.parseModel || llmModels[0] || DEFAULT_PARSE_MODEL;
  return {
    apiKey,
    parseModel,
    ttsModel: s.ttsModel || DEFAULT_TTS_MODEL,
    spendCapUsd: normalizeCap(s.spendCapUsd),
    llmModels,
    imageModels: normalizeModelList(s.imageModels),
    videoModels: normalizeModelList(s.videoModels),
  };
}

/** The configured global spend cap (USD), or null when unset. */
export async function getSpendCap(): Promise<number | null> {
  return normalizeCap((await read()).spendCapUsd);
}

export async function updateSettings(patch: {
  llmApiKey?: string | null;
  parseModel?: string | null;
  ttsModel?: string | null;
  spendCapUsd?: number | null;
  llmModels?: string[] | null;
  imageModels?: string[] | null;
  videoModels?: string[] | null;
}): Promise<AppSettingsDTO> {
  const s = await read();
  if (patch.llmApiKey !== undefined) s.llmApiKey = patch.llmApiKey || null;
  if (patch.parseModel !== undefined) s.parseModel = patch.parseModel || undefined;
  if (patch.ttsModel !== undefined) s.ttsModel = patch.ttsModel || undefined;
  if (patch.spendCapUsd !== undefined) s.spendCapUsd = normalizeCap(patch.spendCapUsd);
  if (patch.llmModels !== undefined) {
    const list = normalizeModelList(patch.llmModels);
    s.llmModels = list.length ? list : undefined;
  }
  if (patch.imageModels !== undefined) {
    const list = normalizeModelList(patch.imageModels);
    s.imageModels = list.length ? list : undefined;
  }
  if (patch.videoModels !== undefined) {
    const list = normalizeModelList(patch.videoModels);
    s.videoModels = list.length ? list : undefined;
  }
  await fs.writeNickel(SETTINGS_FILE, s);
  return getSettings();
}
