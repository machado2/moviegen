import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
// Film and comics projects are each namespaced under their medium so the two
// (both otherwise {id} directories) never collide: data/films/projects and
// data/comics/projects.
export const PROJECTS_DIR = path.join(DATA_DIR, 'films', 'projects');
export const COMICS_PROJECTS_DIR = path.join(DATA_DIR, 'comics', 'projects');

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

// Comics page-montage defaults (see comics spec "Parâmetros de Montagem").
export const MONTAGEM_DEFAULTS = {
  gutterPx: 48,
  background: 'black',
  fit: 'contain' as const,
  canvasWidth: 1800,
  canvasHeight: 2700,
};

// External CLI used for AI frame generation (codex image_gen). Configurable.
export const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
export const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';

// Nickel CLI: evaluates the on-disk .ncl project files back into data.
export const NICKEL_BIN = process.env.NICKEL_BIN ?? 'nickel';
