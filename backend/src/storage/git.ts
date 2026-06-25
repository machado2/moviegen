// Per-project version history. Each project directory is its own git
// repository; meaningful mutations are auto-committed so the user can browse
// history and restore an earlier state instead of confirming every save.
//
// Everything here is best-effort: if git is missing or a command fails, we log
// and carry on. Versioning must never break the user's actual save.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const IDENTITY = [
  '-c', 'user.name=MediaGen',
  '-c', 'user.email=mediagen@localhost',
  '-c', 'commit.gpgsign=false',
  '-c', 'core.hooksPath=/dev/null',
];

let gitAvailable: boolean | null = null;

// Serialize git operations per directory so concurrent saves don't collide on
// the index lock (e.g. two API generations finishing at once).
const queues = new Map<string, Promise<unknown>>();
function serialize<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(dir) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(dir, next.catch(() => {}));
  return next;
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn('git', args, { cwd });
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'spawn failed' });
      return;
    }
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => resolve({ code: -1, stdout, stderr: 'spawn error' }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function isGitAvailable(): Promise<boolean> {
  if (gitAvailable !== null) return gitAvailable;
  const r = await runGit(process.cwd(), ['--version']);
  gitAvailable = r.code === 0;
  if (!gitAvailable) {
    console.warn('[git] git CLI not found; project history disabled');
  }
  return gitAvailable;
}

async function isRepo(dir: string): Promise<boolean> {
  return fs
    .access(path.join(dir, '.git'))
    .then(() => true)
    .catch(() => false);
}

async function ensureRepoUnlocked(dir: string): Promise<boolean> {
  if (!(await isGitAvailable())) return false;
  if (await isRepo(dir)) return true;
  await fs.mkdir(dir, { recursive: true });
  const init = await runGit(dir, ['init', '-b', 'main']);
  if (init.code !== 0) {
    console.warn(`[git] init failed in ${dir}: ${init.stderr.trim()}`);
    return false;
  }
  // Treat media as binary; keep text formats diffable.
  await fs
    .writeFile(
      path.join(dir, '.gitattributes'),
      '*.png binary\n*.jpg binary\n*.jpeg binary\n*.webp binary\n*.mp4 binary\n*.mp3 binary\n*.wav binary\n*.ncl text\n*.md text\n',
      'utf8',
    )
    .catch(() => {});
  return true;
}

/** Initialize the repo if needed (idempotent, best-effort). */
export async function ensureRepo(dir: string): Promise<void> {
  await serialize(dir, () => ensureRepoUnlocked(dir));
}

/**
 * Stage everything and commit with the given message. Returns the new commit's
 * short hash, or null when there was nothing to commit / git is unavailable.
 */
export async function commit(dir: string, message: string): Promise<string | null> {
  return serialize(dir, async () => {
    if (!(await ensureRepoUnlocked(dir))) return null;
    const add = await runGit(dir, ['add', '-A']);
    if (add.code !== 0) {
      console.warn(`[git] add failed in ${dir}: ${add.stderr.trim()}`);
      return null;
    }
    const status = await runGit(dir, ['status', '--porcelain']);
    if (status.code === 0 && status.stdout.trim() === '') return null; // nothing changed
    const res = await runGit(dir, [...IDENTITY, 'commit', '-m', message, '--allow-empty-message']);
    if (res.code !== 0) {
      console.warn(`[git] commit failed in ${dir}: ${res.stderr.trim()}`);
      return null;
    }
    const head = await runGit(dir, ['rev-parse', '--short', 'HEAD']);
    return head.code === 0 ? head.stdout.trim() : null;
  });
}

export interface HistoryEntry {
  hash: string;
  shortHash: string;
  message: string;
  date: string; // ISO 8601
}

const LOG_SEP = '\x1f';
const REC_SEP = '\x1e';

/** Commit log, newest first. Empty when there's no repo yet. */
export async function history(dir: string, limit = 200): Promise<HistoryEntry[]> {
  return serialize(dir, async () => {
    if (!(await isGitAvailable()) || !(await isRepo(dir))) return [];
    const fmt = ['%H', '%h', '%s', '%cI'].join(LOG_SEP);
    const r = await runGit(dir, ['log', `--max-count=${limit}`, `--pretty=format:${fmt}${REC_SEP}`]);
    if (r.code !== 0) return [];
    return r.stdout
      .split(REC_SEP)
      .map((rec) => rec.replace(/^\n/, '').trim())
      .filter(Boolean)
      .map((rec) => {
        const [hash, shortHash, message, date] = rec.split(LOG_SEP);
        return {
          hash: hash ?? '',
          shortHash: shortHash ?? '',
          message: message ?? '',
          date: date ?? '',
        };
      });
  });
}

/**
 * Restore the project tree to the state at `hash`, recorded as a new commit so
 * the restore is itself reversible. Returns the new commit's short hash.
 */
export async function restore(dir: string, hash: string): Promise<string | null> {
  return serialize(dir, async () => {
    if (!(await isGitAvailable()) || !(await isRepo(dir))) return null;
    // Bring back that commit's version of every path it contained…
    const checkout = await runGit(dir, ['checkout', hash, '--', '.']);
    if (checkout.code !== 0) {
      console.warn(`[git] restore checkout failed in ${dir}: ${checkout.stderr.trim()}`);
      return null;
    }
    // …then delete files that were added *after* that commit (still tracked, so
    // `clean` wouldn't catch them) so the tree matches the target exactly.
    const added = await runGit(dir, ['diff', '--name-only', '--diff-filter=A', `${hash}`, 'HEAD']);
    if (added.code === 0) {
      for (const f of added.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
        await runGit(dir, ['rm', '-f', '--', f]);
      }
    }
    // Drop any stray untracked files too.
    await runGit(dir, ['clean', '-fd']);
    await runGit(dir, ['add', '-A']);
    const status = await runGit(dir, ['status', '--porcelain']);
    if (status.code === 0 && status.stdout.trim() === '') return null;
    const short = hash.slice(0, 8);
    const res = await runGit(dir, [...IDENTITY, 'commit', '-m', `restaurar: ${short}`]);
    if (res.code !== 0) {
      console.warn(`[git] restore commit failed in ${dir}: ${res.stderr.trim()}`);
      return null;
    }
    const head = await runGit(dir, ['rev-parse', '--short', 'HEAD']);
    return head.code === 0 ? head.stdout.trim() : null;
  });
}
