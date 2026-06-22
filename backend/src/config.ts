import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// Where the built frontend lives, relative to the compiled server.
// In production the server runs from dist/server.js and the frontend is at dist/public.
export const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.resolve(here, 'public');

export const DEFAULT_PARSE_MODEL = 'google/gemini-2.5-pro';
export const DEFAULT_TTS_MODEL = 'openai/gpt-4o-mini-tts';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Maximum shot duration in seconds — the natural limit of current AI video models.
export const MAX_SHOT_SECONDS = 15;
