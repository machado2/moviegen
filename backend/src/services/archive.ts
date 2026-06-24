import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import type { Project, Scene } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, createProject, saveProject } from './project.js';
import { badRequest, notFound } from '../lib/errors.js';
import { validateProject, validateScene } from '../lib/validate.js';

/** Build a ZIP stream of the whole project, with the API key redacted. */
export async function exportProjectZip(projectId: string): Promise<Readable> {
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
  // scenes/, assets/, takes/, output/ — copy directories as-is if present.
  for (const dir of ['scenes', 'assets', 'takes', 'output']) {
    const abs = path.join(root, dir);
    if (await fs.pathExists(abs)) archive.directory(abs, dir);
  }

  void archive.finalize();
  return out;
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
  return project;
}

export async function assertProjectExists(projectId: string): Promise<void> {
  if (!(await fs.pathExists(fs.projectFile(projectId)))) throw notFound('Project');
}
