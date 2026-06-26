import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import type { Project, Scene } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, createProject, saveProject } from './project.js';
import { badRequest, notFound } from '../lib/errors.js';
import { validateProject, validateScene } from '../lib/validate.js';

// The media directories — large, generated outputs. Excluded by the
// structure-only export so a project can be moved between machines cheaply.
const MEDIA_DIRS = ['assets', 'takes', 'output'];

/**
 * Build a ZIP stream of a project, with the API key redacted.
 *
 * - `includeMedia: false` (structure) ships only the Nickel/source files
 *   (project.ncl, script.md, scenes/, and any loose root .ncl like outline.ncl,
 *   cocreate-chat.ncl, parsed-script.ncl). Small, ideal for editing via Claude
 *   Code and moving local↔VPS.
 * - `includeMedia: true` (default) also ships the generated media.
 */
export async function exportProjectZip(
  projectId: string,
  opts: { includeMedia?: boolean } = {},
): Promise<Readable> {
  const includeMedia = opts.includeMedia ?? true;
  const project = await getProject(projectId);
  const root = fs.projectDir(projectId);

  const archive = archiver('zip', { zlib: { level: 9 } });
  const out = new PassThrough();
  archive.on('error', (err) => out.destroy(err));
  archive.pipe(out);

  archive.append(fs.toNickel(project), { name: 'project.ncl' });

  // script.md
  if (await fs.pathExists(fs.scriptFile(projectId))) {
    archive.file(fs.scriptFile(projectId), { name: 'script.md' });
  }
  // Loose root .ncl structure files (outline.ncl, cocreate-chat.ncl,
  // parsed-script.ncl, …) — anything but project.ncl, which is written redacted.
  for (const name of await rootNickelFiles(root)) {
    archive.file(path.join(root, name), { name });
  }
  // scenes/ is structure; the media dirs are added only for a full export.
  const dirs = includeMedia ? ['scenes', ...MEDIA_DIRS] : ['scenes'];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (await fs.pathExists(abs)) archive.directory(abs, dir);
  }

  void archive.finalize();
  return out;
}

/** Loose `*.ncl` files in the project root, excluding the redacted project.ncl. */
async function rootNickelFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.ncl') && e.name !== 'project.ncl')
    .map((e) => e.name);
}

/** Import a project from a ZIP buffer. Validates against the current types. */
export async function importProjectZip(buffer: Buffer): Promise<Project> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw badRequest('Uploaded file is not a valid ZIP');
  }
  const entries = zip.getEntries();

  const projectEntry = entries.find((e) => e.entryName === 'project.ncl' || e.entryName.endsWith('/project.ncl'));
  if (!projectEntry) throw badRequest('ZIP does not contain project.ncl');
  // The prefix lets us support both flat zips and {projectId}/... wrapped zips.
  const prefix = projectEntry.entryName.replace(/project\.ncl$/, '');

  let projectJson: unknown;
  try {
    projectJson = await fs.readNickelString(projectEntry.getData().toString('utf8'));
  } catch {
    throw badRequest('project.ncl is not valid Nickel');
  }
  const errors = validateProject(projectJson);
  if (errors.length) {
    throw badRequest('project.ncl does not match the current format', errors.slice(0, 30));
  }
  const incoming = projectJson as Project;

  // Validate scene files before committing anything.
  const sceneErrors: string[] = [];
  const sceneEntries = entries.filter(
    (e) => e.entryName.startsWith(`${prefix}scenes/`) && e.entryName.endsWith('.ncl'),
  );
  const scenes: Scene[] = [];
  for (const e of sceneEntries) {
    let parsed: unknown;
    try {
      parsed = await fs.readNickelString(e.getData().toString('utf8'));
    } catch {
      sceneErrors.push(`${e.entryName}: not valid Nickel`);
      continue;
    }
    const errs = validateScene(parsed, e.entryName);
    if (errs.length) sceneErrors.push(...errs);
    else scenes.push(parsed as Scene);
  }
  if (sceneErrors.length) {
    throw badRequest('A scene file does not match the current format', sceneErrors.slice(0, 30));
  }

  // Commit: new project id, write all files.
  const created = await createProject({ title: incoming.title, language: incoming.language });
  const project: Project = {
    ...incoming,
    id: created.id,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
  const root = fs.projectDir(project.id);

  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = e.entryName.slice(prefix.length);
    if (!rel || rel === 'project.ncl') continue; // project.ncl written separately
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // zip-slip guard
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep)) continue;
    await fs.writeBuffer(dest, e.getData());
  }

  await saveProject(project);
  await fs.commitProject(project.id, 'projeto importado');
  return project;
}

export async function assertProjectExists(projectId: string): Promise<void> {
  if (!(await fs.pathExists(fs.projectFile(projectId)))) throw notFound('Project');
}
