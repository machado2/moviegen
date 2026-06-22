import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import type { ComicsProject } from '@moviegen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, createProject, saveProject } from './project.js';
import { badRequest } from '../../lib/errors.js';
import { validateComicsProject, validatePrancha } from '../validate.js';

export async function exportProjectZip(projectId: string): Promise<Readable> {
  const project = await getProject(projectId);
  const root = cfs.projectDir(projectId);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const out = new PassThrough();
  archive.on('error', (err) => out.destroy(err));
  archive.pipe(out);

  const redacted: ComicsProject = { ...project, openrouterApiKey: null };
  archive.append(JSON.stringify(redacted, null, 2), { name: 'project.json' });

  if (await fs.pathExists(cfs.scriptFile(projectId))) {
    archive.file(cfs.scriptFile(projectId), { name: 'script.md' });
  }
  for (const dir of ['pranchas', 'assets', 'renders', 'output']) {
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
  const projectEntry = entries.find((e) => e.entryName === 'project.json' || e.entryName.endsWith('/project.json'));
  if (!projectEntry) throw badRequest('ZIP does not contain project.json');
  const prefix = projectEntry.entryName.replace(/project\.json$/, '');

  let projectJson: unknown;
  try {
    projectJson = JSON.parse(projectEntry.getData().toString('utf8'));
  } catch {
    throw badRequest('project.json is not valid JSON');
  }
  const errors = validateComicsProject(projectJson);
  if (errors.length) throw badRequest('project.json does not match the current format', errors.slice(0, 30));
  const incoming = projectJson as ComicsProject;

  const pranchaErrors: string[] = [];
  const pranchaEntries = entries.filter(
    (e) => e.entryName.startsWith(`${prefix}pranchas/`) && e.entryName.endsWith('.json'),
  );
  for (const e of pranchaEntries) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(e.getData().toString('utf8'));
    } catch {
      pranchaErrors.push(`${e.entryName}: not valid JSON`);
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
    openrouterApiKey: null,
  };
  const root = cfs.projectDir(project.id);
  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = e.entryName.slice(prefix.length);
    if (!rel || rel === 'project.json') continue;
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep)) continue;
    await fs.writeBuffer(dest, e.getData());
  }
  await saveProject(project);
  return project;
}
