// Per-project storage primitives over an absolute project root directory.
// Both the film (filesystem.ts) and comics (comics/storage.ts) path modules
// delegate here, so the project-root resolve guard and the best-effort git
// semantics live in exactly one place. The medium-specific path LAYOUT stays in
// each module; only the dir-generic plumbing is shared.

import path from 'node:path';
import fsp from 'node:fs/promises';
import * as git from './git.js';

/** Resolve a project-relative path to absolute, refusing to escape the root. */
export function resolveInRoot(root: string, relative: string): string {
  const abs = path.resolve(root, relative);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`Path escapes project root: ${relative}`);
  }
  return abs;
}

/** Best-effort commit: never throws, so a save is never blocked by versioning. */
export async function commitDir(dir: string, message: string): Promise<void> {
  try {
    await git.commit(dir, message);
  } catch {
    /* best-effort: versioning must never block a save */
  }
}

export function historyDir(dir: string) {
  return git.history(dir);
}

export function restoreDir(dir: string, hash: string) {
  return git.restore(dir, hash);
}

/** Names of the immediate subdirectories of a base dir (i.e. the project ids). */
export async function listDirs(base: string): Promise<string[]> {
  await fsp.mkdir(base, { recursive: true });
  const entries = await fsp.readdir(base, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
