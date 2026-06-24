import type {
  ComicsAsset,
  ComicsProject,
  ParsedComicsScript,
  Prancha,
  PranchaRef,
  Quadro,
} from '@mediagen/types';
import type { JobProgress } from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { parseComicsScript } from './ai.js';
import { jobQueue } from '../../jobs/queue.js';
import { newId, slugify } from '../../lib/ids.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { slotFormatFor } from '../layout.js';
import { validateComicsProject, validatePrancha } from '../validate.js';

// ─── Script parsing (async job) ───────────────────────────────────────────────
//
// Parsing a full screenplay is a single multi-minute LLM call, so it runs as a
// background job: the route returns a jobId immediately and the client tracks
// progress over SSE. The result is persisted to disk (parsed-script.ncl) the
// moment it's ready, so it survives the client disconnecting or reloading
// before applying — the previous synchronous design lost the whole parse if the
// user navigated away.

// Ref under which a project's parse job is tracked, so a reload can re-attach
// to an in-flight parse and a second click can't start a duplicate.
const parseJobRef = (projectId: string): string => `comics-parse:${projectId}`;

/** Kick off a parse job (or return the one already running). */
export async function startScriptParse(projectId: string): Promise<JobProgress> {
  const project = await getProject(projectId);
  if (!(await fs.pathExists(cfs.scriptFile(projectId)))) throw notFound('Stored screenplay');
  return jobQueue.start(
    'script-parse',
    async (handle) => {
      handle.update(0.05, 'Lendo roteiro…');
      const markdown = await fs.readText(cfs.scriptFile(projectId));
      handle.update(0.15, 'Conectando ao modelo…');
      const parsed = await parseComicsScript(project, markdown, (chars) => {
        // Each call here is real: the model produced more output.
        const kb = (chars / 1024).toFixed(1);
        handle.update(0.20, `Recebendo resposta… ${kb} KB`);
      });
      handle.update(0.95, 'Salvando resultado…');
      await fs.writeNickel(cfs.parsedScriptFile(projectId), parsed);
    },
    parseJobRef(projectId),
  );
}

/** The parse job currently running for this project, or null. */
export async function getActiveParseJob(projectId: string): Promise<JobProgress | null> {
  await getProject(projectId);
  return jobQueue.findActiveByRef(parseJobRef(projectId)) ?? null;
}

/** The last parsed-but-not-yet-applied script, or null if none is pending. */
export async function getParsedScript(projectId: string): Promise<ParsedComicsScript | null> {
  await getProject(projectId);
  if (!(await fs.pathExists(cfs.parsedScriptFile(projectId)))) return null;
  return fs.readNickel<ParsedComicsScript>(cfs.parsedScriptFile(projectId));
}

/** Discard a pending parsed script (e.g. after it has been applied). */
export async function clearParsedScript(projectId: string): Promise<void> {
  await fs.remove(cfs.parsedScriptFile(projectId));
}

export async function applyParsedComicsScript(
  projectId: string,
  parsed: ParsedComicsScript,
): Promise<ComicsProject> {
  const project = await getProject(projectId);
  project.title = parsed.title || project.title;
  project.language = parsed.language || project.language;
  if (parsed.globalStyle) project.globalStyle = parsed.globalStyle;

  // Character assets (pending). Asset id is the character slug for stable refs.
  const assetIdByChar = new Map<string, string>();
  for (const c of parsed.characters) {
    const charSlug = slugify(c.id || c.name);
    const asset: ComicsAsset = {
      id: charSlug,
      type: 'image',
      role: 'character',
      status: 'pending',
      file: null,
      characterName: c.name,
      characterDescription: c.description,
    };
    project.assets[asset.id] = asset;
    assetIdByChar.set(charSlug, asset.id);
  }

  const refs: PranchaRef[] = [];
  for (const pp of parsed.pranchas) {
    const pranchaId = `prancha-${pp.number}-${slugify(pp.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
    const quadros: Quadro[] = pp.quadros.map((q, i) => ({
      id: newId('quadro'),
      order: i + 1,
      // Trust the layout, not the model, for slot format.
      slotFormat: slotFormatFor(pp.layout, i),
      composition: q.composition,
      characters: (q.characterIds ?? [])
        .map((cid) => assetIdByChar.get(slugify(cid)))
        .filter((id): id is string => Boolean(id)),
      setting: q.setting,
      texts: q.texts ?? [],
      restrictions: q.restrictions ?? [],
      refs: [],
      selectedRenderId: null,
      renders: [],
    }));
    const prancha: Prancha = {
      id: pranchaId,
      number: pp.number,
      shortTitle: pp.shortTitle,
      origin: pp.origin,
      layout: pp.layout,
      quadros,
    };
    await fs.writeNickel(cfs.pranchaFile(projectId, pranchaId), prancha);
    refs.push({ id: pranchaId, number: pp.number, shortTitle: pp.shortTitle, file: `pranchas/${pranchaId}.ncl` });
  }
  refs.sort((a, b) => a.number - b.number);
  project.pranchas = refs;
  const saved = await saveProject(project);
  // The pending parse has been consumed; drop it so the UI doesn't re-offer it.
  await clearParsedScript(projectId);
  return saved;
}

export type StructuredImportPayload = ComicsProject & { pranchasData?: Prancha[] };

export async function structuredImport(projectId: string, payload: unknown): Promise<ComicsProject> {
  if (typeof payload !== 'object' || payload === null) {
    throw badRequest('Structured import payload must be an object');
  }
  const existing = await getProject(projectId);
  const { pranchasData, ...projectLike } = payload as StructuredImportPayload;

  const projectErrors = validateComicsProject(projectLike);
  if (projectErrors.length) {
    throw badRequest('Project JSON does not match the current format', projectErrors.slice(0, 30));
  }
  const incoming = projectLike as ComicsProject;

  const pranchaErrors: string[] = [];
  (pranchasData ?? []).forEach((p, i) => pranchaErrors.push(...validatePrancha(p, `pranchasData[${i}]`)));
  if (pranchaErrors.length) {
    throw badRequest('Prancha JSON does not match the current format', pranchaErrors.slice(0, 30));
  }

  const project: ComicsProject = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };

  await fs.remove(cfs.pranchasDir(projectId));
  const byId = new Map((pranchasData ?? []).map((p) => [p.id, p]));
  const refs: PranchaRef[] = [];
  for (const ref of incoming.pranchas) {
    const prancha = byId.get(ref.id);
    if (prancha) {
      await fs.writeNickel(cfs.pranchaFile(project.id, prancha.id), prancha);
      refs.push({ id: prancha.id, number: prancha.number, shortTitle: prancha.shortTitle, file: `pranchas/${prancha.id}.ncl` });
    } else {
      refs.push(ref);
    }
  }
  refs.sort((a, b) => a.number - b.number);
  project.pranchas = refs;
  return saveProject(project);
}
