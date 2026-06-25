// Minimal .env loader, imported as the very first thing in server.ts so the
// rest of the config (config.ts reads process.env at module load) sees it.
//
// Why this exists: the gateway key (LLM_API_KEY) and base URL used to come only
// from the env of whatever shell launched the process — ephemeral, lost on a
// VM/service restart, so the parse silently broke until someone re-exported it
// (see TASK-3). A persistent, gitignored `.env` on the host fixes that, but the
// production entrypoint (`node dist/server.js`) never sourced one; only the dev
// shell wrapper did. This makes a `.env` authoritative in every launch mode.
//
// Zero-dependency on purpose (the project favours tiny self-contained codecs,
// e.g. the Nickel serializer). Already-set env vars always win, so an explicit
// `LLM_API_KEY=… node …` still overrides the file.

import fs from 'node:fs';
import path from 'node:path';

// Parse a single `.env` line into [key, value], or null to skip it.
function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  // Tolerate a leading `export ` (so the same file can be `source`d by a shell).
  const body = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
  const eq = body.indexOf('=');
  if (eq === -1) return null;
  const key = body.slice(0, eq).trim();
  if (!key) return null;
  let value = body.slice(eq + 1).trim();
  // Strip matching surrounding quotes; leave the inner text verbatim.
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

// Locate the `.env`: an explicit DOTENV_PATH, else the nearest one walking up
// from the working directory (covers both repo-root `pnpm start` and the
// backend-cwd dev runner).
function findEnvFile(): string | null {
  if (process.env.DOTENV_PATH) {
    return fs.existsSync(process.env.DOTENV_PATH) ? process.env.DOTENV_PATH : null;
  }
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadEnv(): void {
  const file = findEnvFile();
  if (!file) return;
  let contents: string;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    // Never clobber a variable that's already set in the real environment.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();
