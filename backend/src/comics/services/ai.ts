import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { CODEX_BIN } from '../../config.js';
import { HttpError } from '../../lib/errors.js';

// ─── Frame generation (codex image_gen) ───────────────────────────────────────
//
// Integration seam. The exact codex CLI invocation and rollout-PNG retrieval can
// vary by codex version, so this is the single place to adapt. It runs codex
// non-interactively in a temp working dir and returns the produced PNG bytes.
// Override the whole command with CODEX_IMAGE_CMD if your CLI differs.
//
// (Screenplay parsing lives in parseAgent.ts — an agentic tool-calling loop on
// the Vercel AI SDK — not here.)

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
