// All filesystem I/O for project data is abstracted here. Nothing else in the
// backend touches fs paths directly.

import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, PROJECTS_DIR } from '../config.js';

export function projectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}
export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.json');
}
export function scriptFile(projectId: string): string {
  return path.join(projectDir(projectId), 'script.md');
}
export function scenesDir(projectId: string): string {
  return path.join(projectDir(projectId), 'scenes');
}
export function sceneFile(projectId: string, sceneId: string): string {
  return path.join(scenesDir(projectId), `${sceneId}.json`);
}
export function assetsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'assets');
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
  const root = projectDir(projectId);
  const abs = path.resolve(root, relative);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`Path escapes project root: ${relative}`);
  }
  return abs;
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

export async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

export async function readJsonRaw(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as unknown;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
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
  await ensureDir(PROJECTS_DIR);
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** Stream helpers re-exported so routes don't import node:fs directly. */
export { createReadStream, createWriteStream };

export async function init(): Promise<void> {
  await ensureDir(DATA_DIR);
  await ensureDir(PROJECTS_DIR);
}
