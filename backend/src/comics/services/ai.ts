import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import type { ComicsProject, ParsedComicsScript } from '@mediagen/types';
import { CODEX_BIN, DEFAULT_PARSE_MODEL, OPENROUTER_BASE } from '../../config.js';
import { badRequest, HttpError } from '../../lib/errors.js';
import { validateParsedComicsScript } from '../validate.js';

function requireKey(project: ComicsProject): string {
  if (!project.openrouterApiKey) throw badRequest('No OpenRouter API key configured for this project');
  return project.openrouterApiKey;
}

// Parsing a long screenplay can legitimately take minutes, but a stalled
// connection must not hang the job forever — cap it generously.
const CHAT_TIMEOUT_MS = 8 * 60 * 1000;

async function chat(apiKey: string, model: string, system: string, user: string): Promise<string> {
  // One timeout covers the whole exchange — connecting AND reading the (large)
  // response body. A slow model that dribbles the body must still be capped.
  const signal = AbortSignal.timeout(CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://mediagen.local',
        'X-Title': 'ComicsGen',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(502, `OpenRouter request failed (${res.status})`, text ? [text.slice(0, 500)] : undefined);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, 'OpenRouter returned no content');
    return content;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new HttpError(
        504,
        `O modelo "${model}" não respondeu em ${CHAT_TIMEOUT_MS / 60000} min. Tente um modelo de parse mais rápido ou um roteiro menor.`,
      );
    }
    throw new HttpError(502, `OpenRouter request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = fenced ? fenced[1]! : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return JSON.parse(start !== -1 && end !== -1 ? candidate.slice(start, end + 1) : candidate);
}

const PARSE_SYSTEM_PROMPT = `Você é um assistente de pré-produção de HQs. Converte um roteiro markdown em uma estrutura JSON estrita para um pipeline de produção de graphic novels por IA.

Regras:
- Extraia cada personagem com uma descrição canônica de aparência (idade, etnia, figurino, postura).
- Decomponha cada prancha em quadros com número adequado ao layout inferido.
- Determine o layout adequado: 1 quadro -> "rows-1", 2 -> "rows-2", 3 -> "rows-3", 4 -> "rows-4" (ou "grid-2x2"), 6 -> "grid-2x3", 8 -> "grid-2x4", 5 -> "top-then-grid-2x2".
- Preserve textos do roteiro verbatim, com acentuação e pontuação EXATAS.
- Tipifique cada texto: "dialogue", "offscreen", "voice-over", "caption", "sfx", "sign" ou "title".
- Identifique quais personagens aparecem em cada quadro (characterIds).
- Descreva composição e cenário de cada quadro em prosa imagética.
- slotFormat deve ser coerente com o layout (use um destes valores exatos): "vertical de página inteira, proporção 2:3", "horizontal alto, proporção 4:3", "horizontal panorâmico, proporção 2:1", "horizontal muito panorâmico, proporção 3:1", "vertical, proporção 2:3", "quadrado, proporção 1:1".

Responda com UM ÚNICO objeto JSON correspondente exatamente a este tipo TypeScript, sem comentários:

interface ParsedComicsScript {
  title: string;
  language: string;
  globalStyle: string;
  characters: { id: string; name: string; description: string }[];
  pranchas: {
    number: number;
    shortTitle: string;
    origin: string;
    layout: "rows-1"|"rows-2"|"rows-3"|"rows-4"|"grid-2x2"|"grid-2x3"|"grid-2x4"|"top-then-grid-2x2";
    quadros: {
      order: number;
      slotFormat: string;
      composition: string;
      characterIds: string[];
      setting: string;
      texts: { type: string; speaker?: string; text: string }[];
      restrictions: string[];
    }[];
  }[];
}`;

export async function parseComicsScript(
  project: ComicsProject,
  scriptMarkdown: string,
): Promise<ParsedComicsScript> {
  const apiKey = requireKey(project);
  const model = project.parseModel || DEFAULT_PARSE_MODEL;
  const content = await chat(
    apiKey,
    model,
    PARSE_SYSTEM_PROMPT,
    `Idioma do projeto: ${project.language}\n\nRoteiro:\n\n${scriptMarkdown}`,
  );
  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    throw new HttpError(502, 'Model did not return valid JSON');
  }
  const errors = validateParsedComicsScript(parsed);
  if (errors.length) {
    throw new HttpError(502, 'Parsed script did not match the expected format', errors.slice(0, 20));
  }
  return parsed as ParsedComicsScript;
}

// ─── Frame generation (codex image_gen) ───────────────────────────────────────
//
// Integration seam. The exact codex CLI invocation and rollout-PNG retrieval can
// vary by codex version, so this is the single place to adapt. It runs codex
// non-interactively in a temp working dir and returns the produced PNG bytes.
// Override the whole command with CODEX_IMAGE_CMD if your CLI differs.

export interface GenerateFrameResult {
  png: Buffer;
}

export async function generateFrame(
  promptText: string,
  attachmentPaths: string[],
): Promise<GenerateFrameResult> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'comicsgen-gen-'));
  try {
    const promptFile = path.join(workDir, 'prompt.txt');
    await fsp.writeFile(promptFile, promptText, 'utf8');

    const args = buildCodexArgs(promptText, promptFile, attachmentPaths, workDir);
    await runCodex(args, workDir);

    // Recover the produced PNG: newest .png anywhere under the work dir.
    const png = await findNewestPng(workDir);
    if (!png) {
      throw new HttpError(502, 'codex image_gen finished but produced no PNG');
    }
    return { png };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

function buildCodexArgs(
  promptText: string,
  promptFile: string,
  attachmentPaths: string[],
  workDir: string,
): string[] {
  const template = process.env.CODEX_IMAGE_CMD;
  if (template) {
    // Token substitution in a custom template string.
    return template
      .split(' ')
      .filter(Boolean)
      .map((tok) =>
        tok
          .replace('{prompt}', promptText)
          .replace('{promptFile}', promptFile)
          .replace('{outDir}', workDir)
          .replace('{attachments}', attachmentPaths.join(',')),
      );
  }
  // Best-effort default: `codex exec "<prompt>"` with image inputs, run in workDir.
  const args = ['exec', promptText, '--output-dir', workDir];
  for (const a of attachmentPaths) args.push('-i', a);
  return args;
}

function runCodex(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // On Windows the codex CLI is typically a .cmd shim, which Node refuses to
    // spawn without a shell (it throws EINVAL since the CVE-2024-27980 fix).
    const child = spawn(CODEX_BIN, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new HttpError(503, `codex CLI not found ("${CODEX_BIN}"). Upload a render instead, or configure CODEX_BIN/CODEX_IMAGE_CMD.`));
      } else {
        reject(new HttpError(502, `Failed to run codex: ${err.message}`));
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new HttpError(502, `codex exited with code ${code}`, stderr ? [stderr.slice(0, 500)] : undefined));
    });
  });
}

async function findNewestPng(dir: string): Promise<Buffer | null> {
  const entries = await fsp.readdir(dir, { withFileTypes: true, recursive: true } as { withFileTypes: true; recursive: true });
  let newest: { file: string; mtime: number } | null = null;
  for (const e of entries) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.png')) continue;
    const parent = (e as unknown as { parentPath?: string; path?: string }).parentPath ?? (e as unknown as { path?: string }).path ?? dir;
    const full = path.join(parent, e.name);
    const st = await fsp.stat(full);
    if (!newest || st.mtimeMs > newest.mtime) newest = { file: full, mtime: st.mtimeMs };
  }
  if (!newest) return null;
  return fsp.readFile(newest.file);
}
