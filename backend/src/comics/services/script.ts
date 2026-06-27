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
import { parseComicsScriptAgentic } from './parseAgent.js';
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
      // Agentic parse: the model builds the structure via tool calls, emitting a
      // live step per character/prancha/quadro through handle.update.
      const parsed = await parseComicsScriptAgentic(project, markdown, handle.signal, handle.update);
      handle.update(0.96, 'Salvando resultado…');
      await fs.writeNickel(cfs.parsedScriptFile(projectId), parsed);
    },
    parseJobRef(projectId),
  );
}

/** Cancel the in-flight parse for a project, if any. Returns whether it cancelled. */
export async function cancelScriptParse(projectId: string): Promise<boolean> {
  await getProject(projectId);
  const job = jobQueue.findActiveByRef(parseJobRef(projectId));
  return job ? jobQueue.cancel(job.id) : false;
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

/**
 * Apply a reviewed ParsedComicsScript to a project by MERGING it into the
 * existing structure, never destructively replacing it — so a re-parse cannot
 * lose generated renders, paid media, or manual edits.
 *
 *  - Pranchas are matched by `number`: a matched prancha keeps its id and file,
 *    and only its descriptive fields (shortTitle, origin, layout) are refreshed.
 *  - Quadros are matched by `order` within a matched prancha: a matched quadro
 *    keeps its id, renders, and selectedRenderId; its descriptive fields are
 *    refreshed. A quadro order present on disk but absent from the parse is
 *    kept untouched.
 *  - A parsed prancha with a brand-new number is created fresh; an existing
 *    prancha whose number is absent from the parse is left untouched.
 *  - Character assets are upserted by their stable slug id: an existing asset
 *    keeps its status, file, and variants/selectedVariantId (its generated
 *    image), refreshing only the descriptive fields. Only brand-new characters
 *    get a pending asset.
 */
export async function applyParsedComicsScript(
  projectId: string,
  parsed: ParsedComicsScript,
): Promise<ComicsProject> {
  const project = await getProject(projectId);
  project.title = parsed.title || project.title;
  project.language = parsed.language || project.language;
  if (parsed.globalStyle) project.globalStyle = parsed.globalStyle;

  // Upsert character assets. An already-present asset keeps its generated media
  // (status/file/variants) — we only refresh the descriptive fields, so
  // re-parsing never resets a generated character image back to pending.
  const assetIdByChar = new Map<string, string>();
  for (const c of parsed.characters) {
    const charSlug = slugify(c.id || c.name);
    const existing = project.assets[charSlug];
    if (existing) {
      existing.characterName = c.name;
      existing.characterDescription = c.description;
    } else {
      project.assets[charSlug] = {
        id: charSlug,
        type: 'image',
        role: 'character',
        status: 'pending',
        file: null,
        characterName: c.name,
        characterDescription: c.description,
      };
    }
    assetIdByChar.set(charSlug, charSlug);
  }

  const mapCharacters = (q: ParsedComicsScript['pranchas'][number]['quadros'][number]): string[] =>
    (q.characterIds ?? [])
      .map((cid) => assetIdByChar.get(slugify(cid)))
      .filter((id): id is string => Boolean(id));

  // Read existing pranchas (by number) so we can merge into them in place.
  const existingByNumber = new Map<number, Prancha>();
  for (const ref of project.pranchas) {
    const file = cfs.pranchaFile(projectId, ref.id);
    if (await fs.pathExists(file)) {
      const prancha = await fs.readNickel<Prancha>(file);
      existingByNumber.set(prancha.number, prancha);
    }
  }

  const refs: PranchaRef[] = [];
  const parsedNumbers = new Set<number>();
  for (const pp of parsed.pranchas) {
    parsedNumbers.add(pp.number);
    const existing = existingByNumber.get(pp.number);

    if (existing) {
      // Matched prancha: keep id + file, refresh descriptive fields, merge quadros.
      const existingByOrder = new Map<number, Quadro>();
      for (const q of existing.quadros) existingByOrder.set(q.order, q);
      const parsedOrders = new Set<number>();
      const mergedQuadros: Quadro[] = [];
      pp.quadros.forEach((q, i) => {
        const order = i + 1;
        parsedOrders.add(order);
        const ex = existingByOrder.get(order);
        if (ex) {
          // Keep id, renders, selectedRenderId; refresh descriptive fields.
          mergedQuadros.push({
            ...ex,
            order,
            // Trust the layout, not the model, for slot format.
            slotFormat: slotFormatFor(pp.layout, i),
            composition: q.composition,
            characters: mapCharacters(q),
            setting: q.setting,
            texts: q.texts ?? [],
            restrictions: q.restrictions ?? [],
          });
        } else {
          mergedQuadros.push({
            id: newId('quadro'),
            order,
            slotFormat: slotFormatFor(pp.layout, i),
            composition: q.composition,
            characters: mapCharacters(q),
            setting: q.setting,
            texts: q.texts ?? [],
            restrictions: q.restrictions ?? [],
            refs: [],
            selectedRenderId: null,
            renders: [],
          });
        }
      });
      // Keep existing quadros the parse no longer mentions (their renders survive).
      for (const q of existing.quadros) {
        if (!parsedOrders.has(q.order)) mergedQuadros.push(q);
      }
      mergedQuadros.sort((a, b) => a.order - b.order);
      const merged: Prancha = {
        ...existing,
        shortTitle: pp.shortTitle,
        origin: pp.origin,
        layout: pp.layout,
        quadros: mergedQuadros,
      };
      await fs.writeNickel(cfs.pranchaFile(projectId, existing.id), merged);
      refs.push({ id: existing.id, number: existing.number, shortTitle: pp.shortTitle, file: `pranchas/${existing.id}.ncl` });
    } else {
      // Brand-new prancha number: create fresh.
      const pranchaId = `prancha-${pp.number}-${slugify(pp.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
      const quadros: Quadro[] = pp.quadros.map((q, i) => ({
        id: newId('quadro'),
        order: i + 1,
        // Trust the layout, not the model, for slot format.
        slotFormat: slotFormatFor(pp.layout, i),
        composition: q.composition,
        characters: mapCharacters(q),
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
  }

  // Keep existing pranchas the parse no longer mentions, untouched.
  for (const ref of project.pranchas) {
    if (!parsedNumbers.has(ref.number)) refs.push(ref);
  }

  refs.sort((a, b) => a.number - b.number);
  project.pranchas = refs;
  const saved = await saveProject(project);
  // The pending parse has been consumed; drop it so the UI doesn't re-offer it.
  await clearParsedScript(projectId);
  await cfs.commitProject(
    projectId,
    `parse mesclado: ${parsed.pranchas.length} pranchas · ${parsed.characters.length} personagens`,
  );
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
  const saved = await saveProject(project);
  await cfs.commitProject(projectId, 'projeto importado');
  return saved;
}
