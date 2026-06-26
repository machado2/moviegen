import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import type { ComicsProject } from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, createProject, saveProject } from './project.js';
import { badRequest } from '../../lib/errors.js';
import { validateComicsProject, validatePrancha } from '../validate.js';

// Generated media directories — excluded by the structure-only export.
const MEDIA_DIRS = ['assets', 'renders', 'output'];

/**
 * Build a ZIP stream of a comics project, API key redacted. `includeMedia: false`
 * (structure) ships only project.ncl + script.md + pranchas/ + loose root .ncl;
 * the default (true) also ships the generated media.
 */
export async function exportProjectZip(
  projectId: string,
  opts: { includeMedia?: boolean } = {},
): Promise<Readable> {
  const includeMedia = opts.includeMedia ?? true;
  const project = await getProject(projectId);
  const root = cfs.projectDir(projectId);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const out = new PassThrough();
  archive.on('error', (err) => out.destroy(err));
  archive.pipe(out);

  archive.append(fs.toNickel(project), { name: 'project.ncl' });

  if (await fs.pathExists(cfs.scriptFile(projectId))) {
    archive.file(cfs.scriptFile(projectId), { name: 'script.md' });
  }
  // Loose root .ncl structure files (parsed-script.ncl, …), excluding project.ncl.
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.ncl') && e.name !== 'project.ncl') {
      archive.file(path.join(root, e.name), { name: e.name });
    }
  }
  const dirs = includeMedia ? ['pranchas', ...MEDIA_DIRS] : ['pranchas'];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (await fs.pathExists(abs)) archive.directory(abs, dir);
  }
  void archive.finalize();
  return out;
}

export async function importProjectZip(buffer: Buffer): Promise<ComicsProject> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw badRequest('Uploaded file is not a valid ZIP');
  }
  const entries = zip.getEntries();
  const projectEntry = entries.find((e) => e.entryName === 'project.ncl' || e.entryName.endsWith('/project.ncl'));
  if (!projectEntry) throw badRequest('ZIP does not contain project.ncl');
  const prefix = projectEntry.entryName.replace(/project\.ncl$/, '');

  let projectJson: unknown;
  try {
    projectJson = await fs.readNickelString(projectEntry.getData().toString('utf8'));
  } catch {
    throw badRequest('project.ncl is not valid Nickel');
  }
  const errors = validateComicsProject(projectJson);
  if (errors.length) throw badRequest('project.ncl does not match the current format', errors.slice(0, 30));
  const incoming = projectJson as ComicsProject;

  const pranchaErrors: string[] = [];
  const pranchaEntries = entries.filter(
    (e) => e.entryName.startsWith(`${prefix}pranchas/`) && e.entryName.endsWith('.ncl'),
  );
  for (const e of pranchaEntries) {
    let parsed: unknown;
    try {
      parsed = await fs.readNickelString(e.getData().toString('utf8'));
    } catch {
      pranchaErrors.push(`${e.entryName}: not valid Nickel`);
      continue;
    }
    pranchaErrors.push(...validatePrancha(parsed, e.entryName));
  }
  if (pranchaErrors.length) {
    throw badRequest('A prancha file does not match the current format', pranchaErrors.slice(0, 30));
  }

  const created = await createProject({ title: incoming.title, language: incoming.language });
  const project: ComicsProject = {
    ...incoming,
    id: created.id,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
  const root = cfs.projectDir(project.id);
  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = e.entryName.slice(prefix.length);
    if (!rel || rel === 'project.ncl') continue;
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep)) continue;
    await fs.writeBuffer(dest, e.getData());
  }
  await saveProject(project);
  await cfs.commitProject(project.id, 'projeto importado');
  return project;
}
