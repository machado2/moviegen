// Filesystem paths for comics project data. Reuses the generic I/O helpers
// from the film storage module; only the path layout differs (and it lives
// under data/comics/projects to avoid colliding with film projects).

import fs from 'node:fs/promises';
import path from 'node:path';
import { COMICS_PROJECTS_DIR } from '../config.js';
import { ensureDir } from '../storage/filesystem.js';

export function projectDir(projectId: string): string {
  return path.join(COMICS_PROJECTS_DIR, projectId);
}
export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.json');
}
export function scriptFile(projectId: string): string {
  return path.join(projectDir(projectId), 'script.md');
}
export function pranchasDir(projectId: string): string {
  return path.join(projectDir(projectId), 'pranchas');
}
export function pranchaFile(projectId: string, pranchaId: string): string {
  return path.join(pranchasDir(projectId), `${pranchaId}.json`);
}
export function assetsDir(projectId: string): string {
  return path.join(projectDir(projectId), 'assets');
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
  const root = projectDir(projectId);
  const abs = path.resolve(root, relative);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`Path escapes project root: ${relative}`);
  }
  return abs;
}

export async function listProjectIds(): Promise<string[]> {
  await ensureDir(COMICS_PROJECTS_DIR);
  const entries = await fs.readdir(COMICS_PROJECTS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function init(): Promise<void> {
  await ensureDir(COMICS_PROJECTS_DIR);
}
