import path from 'node:path';
import type { AppSettingsDTO } from '@mediagen/types';
import { DATA_DIR, DEFAULT_PARSE_MODEL, DEFAULT_TTS_MODEL } from '../config.js';
import * as fs from '../storage/filesystem.js';
import { badRequest } from '../lib/errors.js';

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.ncl');

interface Settings {
  openrouterApiKey?: string | null;
  parseModel?: string;
  ttsModel?: string;
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
  return {
    hasApiKey: Boolean(s.openrouterApiKey),
    apiKeyHint: apiKeyHint(s.openrouterApiKey),
    parseModel: s.parseModel || DEFAULT_PARSE_MODEL,
    ttsModel: s.ttsModel || DEFAULT_TTS_MODEL,
  };
}

export async function getAiConfig(): Promise<{ apiKey: string; parseModel: string; ttsModel: string }> {
  const s = await read();
  if (!s.openrouterApiKey) {
    throw badRequest('No OpenRouter API key configured. Set it in Settings.');
  }
  return {
    apiKey: s.openrouterApiKey,
    parseModel: s.parseModel || DEFAULT_PARSE_MODEL,
    ttsModel: s.ttsModel || DEFAULT_TTS_MODEL,
  };
}

export async function updateSettings(patch: {
  openrouterApiKey?: string | null;
  parseModel?: string | null;
  ttsModel?: string | null;
}): Promise<AppSettingsDTO> {
  const s = await read();
  if (patch.openrouterApiKey !== undefined) s.openrouterApiKey = patch.openrouterApiKey || null;
  if (patch.parseModel !== undefined) s.parseModel = patch.parseModel || undefined;
  if (patch.ttsModel !== undefined) s.ttsModel = patch.ttsModel || undefined;
  await fs.writeNickel(SETTINGS_FILE, s);
  return getSettings();
}
