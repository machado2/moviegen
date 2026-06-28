// All filesystem I/O for project data is abstracted here. Nothing else in the
// backend touches fs paths directly.

import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, PROJECTS_DIR } from '../config.js';

// On-disk project data is Nickel, not JSON. These are the codec entry points.
export { readNickel, readNickelString, writeNickel, toNickel } from './nickel.js';

import * as repo from './repo.js';
export type { HistoryEntry } from './git.js';

export function projectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
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
// Co-creation artifacts: the outline/beat sheet and the chat transcript.
export function outlineFile(projectId: string): string {
  return path.join(projectDir(projectId), 'outline.ncl');
}
export function chatThreadFile(projectId: string): string {
  return path.join(projectDir(projectId), 'cocreate-chat.ncl');
}
export function scenesDir(projectId: string): string {
  return path.join(projectDir(projectId), 'scenes');
}
export function sceneFile(projectId: string, sceneId: string): string {
  return path.join(scenesDir(projectId), `${sceneId}.ncl`);
}
// Raw (source) scenes: faithful segmentation of the original script, kept
// separate from the derived production scenes so source vs derived is explicit.
export function rawScenesDir(projectId: string): string {
  return path.join(projectDir(projectId), 'scenes-raw');
}
export function rawSceneFile(projectId: string, number: number): string {
  return path.join(rawScenesDir(projectId), `${number}.ncl`);
}
// Per-scene transform candidates ("breakdowns"): several ways to break one raw
// scene into shots; the user selects one to apply to the production scene.
export function sceneBreakdownsDir(projectId: string, number: number): string {
  return path.join(projectDir(projectId), 'scene-breakdowns', String(number));
}
export function sceneBreakdownFile(projectId: string, number: number, id: string): string {
  return path.join(sceneBreakdownsDir(projectId, number), `${id}.ncl`);
}
export function sceneBreakdownSelectedFile(projectId: string, number: number): string {
  return path.join(sceneBreakdownsDir(projectId, number), 'selected.txt');
}
export function assetsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'assets');
}

/** Sanitize a file extension from an uploaded name, with a per-kind fallback. */
function safeExt(originalName: string, fallback: string): string {
  return (originalName.split('.').pop() ?? fallback).toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;
}
/**
 * Project-relative path of an asset file. With a variantId it names one
 * candidate (assets/<asset>-<variant>.<ext>); without one, the legacy single
 * file (assets/<asset>.<ext>). The on-disk naming scheme lives here, not in the
 * asset service.
 */
export function assetRelPath(assetId: string, variantId: string | null, originalName: string): string {
  const base = variantId ? `${assetId}-${variantId}` : assetId;
  return `assets/${base}.${safeExt(originalName, 'bin')}`;
}
/** Filename of a take's video under its shot's takes/ directory. */
export function takeFilename(takeId: string, originalName: string): string {
  return `${takeId}.${safeExt(originalName, 'mp4')}`;
}
export function sceneTakesDir(projectId: string, sceneId: string): string {
  return path.join(projectDir(projectId), 'takes', sceneId);
}
export function takesDir(projectId: string, sceneId: string, shotId: string): string {
  return path.join(projectDir(projectId), 'takes', sceneId, shotId);
}
export function takeFile(projectId: string, sceneId: string, shotId: string, filename: string): string {
  return path.join(takesDir(projectId, sceneId, shotId), filename);
}
export function outputScenesDir(projectId: string): string {
  return path.join(projectDir(projectId), 'output', 'scenes');
}
export function sceneOutputFile(projectId: string, sceneId: string): string {
  return path.join(outputScenesDir(projectId), `${sceneId}.mp4`);
}
export function movieOutputFile(projectId: string): string {
  return path.join(projectDir(projectId), 'output', 'movie.mp4');
}

/** Resolve a path stored relative to the project root into an absolute path. */
export function resolveInProject(projectId: string, relative: string): string {
  return repo.resolveInRoot(projectDir(projectId), relative);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(file: string): Promise<string> {
  return fs.readFile(file, 'utf8');
}

export async function writeText(file: string, value: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, value, 'utf8');
}

export async function writeBuffer(file: string, data: Buffer): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, data);
}

export async function statFile(file: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const s = await fs.stat(file);
    return { size: s.size, mtime: s.mtime };
  } catch {
    return null;
  }
}

export async function remove(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
}

export async function listProjectIds(): Promise<string[]> {
  return repo.listDirs(PROJECTS_DIR);
}

/** Absolute paths of the .ncl files directly under a directory (unsorted). */
export async function listNickelFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.ncl'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Stream helpers re-exported so routes don't import node:fs directly. */
export { createReadStream, createWriteStream };

// ─── Version history (per-project git repo) ─────────────────────────────────
// Best-effort: never throws, so a save is never blocked by versioning.

/** Record the current state of a film project as a commit. */
export async function commitProject(projectId: string, message: string): Promise<void> {
  return repo.commitDir(projectDir(projectId), message);
}
/** Commit log for a film project, newest first. */
export function projectHistory(projectId: string) {
  return repo.historyDir(projectDir(projectId));
}
/** Restore a film project to an earlier commit (recorded as a new commit). */
export function restoreProject(projectId: string, hash: string) {
  return repo.restoreDir(projectDir(projectId), hash);
}

export async function init(): Promise<void> {
  await ensureDir(DATA_DIR);
  await ensureDir(PROJECTS_DIR);
}
