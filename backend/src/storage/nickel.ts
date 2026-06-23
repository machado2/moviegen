// Nickel codec for on-disk project data. Reading goes through the `nickel`
// binary (it evaluates the .ncl and exports JSON, which we parse in memory —
// JSON is only ever a transient transport here, never written to disk).
// Writing is a self-contained serializer: a JSON-like JS value -> Nickel source.

import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { NICKEL_BIN } from '../config.js';
import { HttpError } from '../lib/errors.js';

// ─── Serialize: JS value → Nickel source ─────────────────────────────────────

// Escape a string for a Nickel double-quoted literal. Crucially `%` becomes
// `\%` so that a literal `%{` is never read as string interpolation.
function escapeNickelString(s: string): string {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '\\': out += '\\\\'; break;
      case '"': out += '\\"'; break;
      case '\n': out += '\\n'; break;
      case '\r': out += '\\r'; break;
      case '\t': out += '\\t'; break;
      case '%': out += '\\%'; break;
      default: {
        const code = ch.codePointAt(0)!;
        if (code < 0x20) out += `\\u{${code.toString(16)}}`;
        else out += ch;
      }
    }
  }
  return out;
}

function pad(indent: number): string {
  return '  '.repeat(indent);
}

function emit(value: unknown, indent: number): string {
  // Match JSON semantics: undefined becomes null inside arrays (object
  // properties holding undefined are dropped by the caller below).
  if (value === null || value === undefined) return 'null';
  switch (typeof value) {
    case 'string':
      return `"${escapeNickelString(value)}"`;
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Cannot serialize non-finite number to Nickel');
      return String(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object':
      break;
    default:
      throw new Error(`Cannot serialize value of type ${typeof value} to Nickel`);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => pad(indent + 1) + emit(v, indent + 1));
    return `[\n${items.join(',\n')}\n${pad(indent)}]`;
  }

  // Record. Quote every field name so arbitrary slug keys are always valid.
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  const lines = entries.map(
    ([k, v]) => `${pad(indent + 1)}"${escapeNickelString(k)}" = ${emit(v, indent + 1)}`,
  );
  return `{\n${lines.join(',\n')}\n${pad(indent)}}`;
}

/** Serialize a JSON-like JS value to Nickel source text. */
export function toNickel(value: unknown): string {
  return `${emit(value, 0)}\n`;
}

// ─── Deserialize: Nickel source → JS value (via the nickel binary) ───────────

function runNickelExport(args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(NICKEL_BIN, ['export', '--format', 'json', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new HttpError(503, `nickel CLI not found ("${NICKEL_BIN}"). Install Nickel or set NICKEL_BIN.`));
      } else {
        reject(new HttpError(500, `Failed to run nickel: ${err.message}`));
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new HttpError(422, 'Nickel evaluation failed', stderr ? [stderr.slice(0, 1000)] : undefined));
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

async function nickelToValue(opts: { file: string } | { src: string }): Promise<unknown> {
  const stdout =
    'file' in opts ? await runNickelExport([opts.file]) : await runNickelExport([], opts.src);
  return JSON.parse(stdout);
}

/** Read and evaluate a .ncl file into a typed value. */
export async function readNickel<T>(file: string): Promise<T> {
  return (await nickelToValue({ file })) as T;
}

/** Evaluate a Nickel source string (e.g. an entry pulled from a ZIP). */
export async function readNickelString<T>(src: string): Promise<T> {
  return (await nickelToValue({ src })) as T;
}

/** Atomically write a value as Nickel source (tmp file + rename). */
export async function writeNickel(file: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, toNickel(value), 'utf8');
  await fsp.rename(tmp, file);
}
