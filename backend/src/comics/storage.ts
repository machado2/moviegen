// Filesystem paths for comics project data. Reuses the generic I/O helpers
// from the film storage module; only the path layout differs (and it lives
// under data/comics/projects to avoid colliding with film projects).

import path from 'node:path';
import { COMICS_PROJECTS_DIR } from '../config.js';
import { ensureDir } from '../storage/filesystem.js';
import * as repo from '../storage/repo.js';

export function projectDir(projectId: string): string {
  return path.join(COMICS_PROJECTS_DIR, projectId);
}
export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.ncl');
}
export function scriptFile(projectId: string): string {
  return path.join(projectDir(projectId), 'script.md');
}
// Parsed-but-not-yet-applied script. Persisted so a long parse survives the
// client navigating away or reloading before it can apply the result.
export function parsedScriptFile(projectId: string): string {
  return path.join(projectDir(projectId), 'parsed-script.ncl');
}
export function pranchasDir(projectId: string): string {
  return path.join(projectDir(projectId), 'pranchas');
}
export function pranchaFile(projectId: string, pranchaId: string): string {
  return path.join(pranchasDir(projectId), `${pranchaId}.ncl`);
}
export function assetsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'assets');
}

/** Sanitize a file extension from an uploaded name, with a per-kind fallback. */
function safeExt(originalName: string, fallback: string): string {
  return (originalName.split('.').pop() ?? fallback).toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;
}
/** Project-relative path of an asset file (variant or legacy single file). */
export function assetRelPath(assetId: string, variantId: string | null, originalName: string): string {
  const base = variantId ? `${assetId}-${variantId}` : assetId;
  return `assets/${base}.${safeExt(originalName, 'png')}`;
}
/** Filename of a render under its quadro's renders/ directory. */
export function renderFilename(renderId: string, originalName: string): string {
  return `${renderId}.${safeExt(originalName, 'png')}`;
}
export function pranchaRendersDir(projectId: string, pranchaId: string): string {
  return path.join(projectDir(projectId), 'renders', pranchaId);
}
export function rendersDir(projectId: string, pranchaId: string, quadroId: string): string {
  return path.join(projectDir(projectId), 'renders', pranchaId, quadroId);
}
export function renderFile(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  filename: string,
): string {
  return path.join(rendersDir(projectId, pranchaId, quadroId), filename);
}
export function outputPranchasDir(projectId: string): string {
  return path.join(projectDir(projectId), 'output', 'pranchas');
}
export function pranchaOutputFile(projectId: string, pranchaId: string): string {
  return path.join(outputPranchasDir(projectId), `${pranchaId}.png`);
}
export function bookOutputFile(projectId: string, format: 'cbz' | 'pdf' | 'epub'): string {
  return path.join(projectDir(projectId), 'output', `book.${format}`);
}

export function resolveInProject(projectId: string, relative: string): string {
  return repo.resolveInRoot(projectDir(projectId), relative);
}

export async function listProjectIds(): Promise<string[]> {
  return repo.listDirs(COMICS_PROJECTS_DIR);
}

export async function init(): Promise<void> {
  await ensureDir(COMICS_PROJECTS_DIR);
}

// ─── Version history (per-project git repo) ─────────────────────────────────

/** Record the current state of a comics project as a commit. */
export async function commitProject(projectId: string, message: string): Promise<void> {
  return repo.commitDir(projectDir(projectId), message);
}
/** Commit log for a comics project, newest first. */
export function projectHistory(projectId: string) {
  return repo.historyDir(projectDir(projectId));
}
/** Restore a comics project to an earlier commit (recorded as a new commit). */
export function restoreProject(projectId: string, hash: string) {
  return repo.restoreDir(projectDir(projectId), hash);
}
