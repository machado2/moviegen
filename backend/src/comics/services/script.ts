import type {
  ComicsSceneBreakdown,
  ComicsAsset,
  ComicsProject,
  ParsedComicsScript,
  ParsedPrancha,
  Prancha,
  PranchaRef,
  Quadro,
  RawScene,
} from '@mediagen/types';
import type { JobProgress } from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { parseComicsScriptAgentic } from './parseAgent.js';
import { transformComicsSceneAgentic } from './transformAgent.js';
import { getAiConfig } from '../../services/settings.js';
import { jobQueue } from '../../jobs/queue.js';
import { newId, slugify } from '../../lib/ids.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { segmentScreenplay } from '../../lib/screenplay.js';
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

// ─── Raw scenes (source layer) ────────────────────────────────────────────────

/** Extract (or re-extract) faithful raw narrative scenes from the stored script. */
export async function extractRawScenes(projectId: string): Promise<RawScene[]> {
  await getProject(projectId);
  if (!(await fs.pathExists(cfs.scriptFile(projectId)))) throw notFound('Stored screenplay');
  const markdown = await fs.readText(cfs.scriptFile(projectId));
  const scenes = segmentScreenplay(markdown, 'script.md');
  await fs.remove(cfs.rawScenesDir(projectId));
  for (const scene of scenes) {
    await fs.writeNickel(cfs.rawSceneFile(projectId, scene.number), scene);
  }
  await cfs.commitProject(projectId, `cenas cruas de HQ extraídas: ${scenes.length}`);
  return scenes;
}

/** List persisted raw scenes in script order. */
export async function listRawScenes(projectId: string): Promise<RawScene[]> {
  await getProject(projectId);
  const dir = cfs.rawScenesDir(projectId);
  if (!(await fs.pathExists(dir))) return [];
  const files = await fs.listNickelFiles(dir);
  const scenes = await Promise.all(files.map((f) => fs.readNickel<RawScene>(f)));
  return scenes.sort((a, b) => a.number - b.number);
}

// ─── Per-scene transform (raw scene → pranchas/quadros) ──────────────────────

const transformJobRef = (projectId: string, n: number): string => `comics-transform:${projectId}:${n}`;
const sceneOriginPrefix = (n: number): string => `scene-raw:${n}:`;
const sceneOrigin = (sceneNumber: number, localPranchaNumber: number): string =>
  `${sceneOriginPrefix(sceneNumber)}${localPranchaNumber}`;

function localPranchaNumber(origin: string, sceneNumber: number): number | null {
  const prefix = sceneOriginPrefix(sceneNumber);
  if (!origin.startsWith(prefix)) return null;
  const n = Number(origin.slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}

async function comicsSceneTransformContext(project: ComicsProject, number: number) {
  const cast = Object.values(project.assets)
    .filter((a) => a.role === 'character')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id, description: a.characterDescription ?? a.description ?? '' }));
  const locations = Object.values(project.assets)
    .filter((a) => a.role === 'location')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id, description: a.characterDescription ?? a.description ?? '' }));
  const read = async (n: number): Promise<RawScene | null> => {
    const f = cfs.rawSceneFile(project.id, n);
    return (await fs.pathExists(f)) ? fs.readNickel<RawScene>(f) : null;
  };
  const prevRaw = await read(number - 1);
  const nextRaw = await read(number + 1);
  return {
    cast,
    locations,
    prev: prevRaw ? { heading: prevRaw.heading, text: prevRaw.text } : undefined,
    next: nextRaw ? { heading: nextRaw.heading } : undefined,
  };
}

/** Kick off a per-scene HQ transform job; persists one candidate breakdown. */
export async function startSceneTransform(projectId: string, number: number): Promise<JobProgress> {
  const project = await getProject(projectId);
  const rawFile = cfs.rawSceneFile(projectId, number);
  if (!(await fs.pathExists(rawFile))) throw notFound('Raw scene');
  const rawScene = await fs.readNickel<RawScene>(rawFile);
  const ctx = await comicsSceneTransformContext(project, number);
  const { parseModel } = await getAiConfig();
  return jobQueue.start(
    'scene-transform',
    async (handle) => {
      const pranchas = await transformComicsSceneAgentic(project, rawScene, ctx, handle.signal, handle.update);
      const id = newId('bd');
      const breakdown: ComicsSceneBreakdown = {
        id,
        sceneNumber: number,
        createdAt: new Date().toISOString(),
        model: parseModel,
        pranchas,
      };
      await fs.writeNickel(cfs.sceneBreakdownFile(projectId, number, id), breakdown);
      const quadroCount = pranchas.reduce((sum, p) => sum + p.quadros.length, 0);
      handle.update(1, `Pronto: ${pranchas.length} pranchas · ${quadroCount} quadros`);
    },
    transformJobRef(projectId, number),
  );
}

export async function cancelSceneTransform(projectId: string, number: number): Promise<boolean> {
  await getProject(projectId);
  const job = jobQueue.findActiveByRef(transformJobRef(projectId, number));
  return job ? jobQueue.cancel(job.id) : false;
}

export async function listSceneBreakdowns(
  projectId: string,
  number: number,
): Promise<{ breakdowns: ComicsSceneBreakdown[]; selectedId: string | null }> {
  await getProject(projectId);
  const dir = cfs.sceneBreakdownsDir(projectId, number);
  if (!(await fs.pathExists(dir))) return { breakdowns: [], selectedId: null };
  const files = (await fs.listNickelFiles(dir)).filter((f) => !f.endsWith('selected.txt'));
  const breakdowns = await Promise.all(files.map((f) => fs.readNickel<ComicsSceneBreakdown>(f)));
  breakdowns.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const selFile = cfs.sceneBreakdownSelectedFile(projectId, number);
  const selectedId = (await fs.pathExists(selFile)) ? (await fs.readText(selFile)).trim() || null : null;
  return { breakdowns, selectedId };
}

export async function selectSceneBreakdown(
  projectId: string,
  number: number,
  breakdownId: string,
): Promise<PranchaRef[]> {
  await getProject(projectId);
  const file = cfs.sceneBreakdownFile(projectId, number, breakdownId);
  if (!(await fs.pathExists(file))) throw notFound('Scene breakdown');
  const breakdown = await fs.readNickel<ComicsSceneBreakdown>(file);
  await applyComicsSceneBreakdown(projectId, breakdown.sceneNumber, breakdown.pranchas);
  await fs.writeText(cfs.sceneBreakdownSelectedFile(projectId, number), breakdownId);
  await cfs.commitProject(projectId, `cena HQ ${number}: breakdown aplicado (${breakdown.pranchas.length} pranchas)`);
  return listPranchaRefsFromProject(projectId);
}

async function listPranchaRefsFromProject(projectId: string): Promise<PranchaRef[]> {
  const project = await getProject(projectId);
  return [...project.pranchas].sort((a, b) => a.number - b.number);
}

async function applyComicsSceneBreakdown(
  projectId: string,
  sceneNumber: number,
  parsedPranchas: ParsedPrancha[],
): Promise<void> {
  const project = await getProject(projectId);
  const assetIds = new Set(Object.keys(project.assets));
  const existingScenePranchas = new Map<number, Prancha>();
  const keepOtherRefs: PranchaRef[] = [];

  for (const ref of project.pranchas) {
    const file = cfs.pranchaFile(projectId, ref.id);
    if (!(await fs.pathExists(file))) continue;
    const prancha = await fs.readNickel<Prancha>(file);
    const local = localPranchaNumber(prancha.origin, sceneNumber);
    if (local == null) keepOtherRefs.push(ref);
    else existingScenePranchas.set(local, prancha);
  }

  const sceneRefs: PranchaRef[] = [];
  for (let i = 0; i < parsedPranchas.length; i++) {
    const pp = parsedPranchas[i]!;
    const local = i + 1;
    const existing = existingScenePranchas.get(local);
    const existingByOrder = new Map((existing?.quadros ?? []).map((q) => [q.order, q]));
    const quadros: Quadro[] = pp.quadros.map((q, qi) => {
      const order = qi + 1;
      const prev = existingByOrder.get(order);
      return {
        id: prev?.id ?? newId('quadro'),
        order,
        slotFormat: slotFormatFor(pp.layout, qi),
        composition: q.composition,
        characters: (q.characterIds ?? []).map(slugify).filter((id) => assetIds.has(id)),
        setting: q.setting,
        texts: q.texts ?? [],
        restrictions: q.restrictions ?? [],
        refs: prev?.refs ?? [],
        skipped: prev?.skipped,
        queuePriority: prev?.queuePriority,
        selectedRenderId: prev?.selectedRenderId ?? null,
        renders: prev?.renders ?? [],
      };
    });
    const id = existing?.id ?? `prancha-scene-${sceneNumber}-${local}-${slugify(pp.shortTitle).slice(0, 20)}-${newId().slice(0, 4)}`;
    const prancha: Prancha = {
      ...existing,
      id,
      number: existing?.number ?? 0,
      shortTitle: pp.shortTitle || `Cena ${sceneNumber}.${local}`,
      origin: sceneOrigin(sceneNumber, local),
      layout: pp.layout,
      renderMode: existing?.renderMode ?? 'panels',
      selectedPageRenderId: existing?.selectedPageRenderId ?? null,
      pageRenders: existing?.pageRenders ?? [],
      quadros,
    };
    await fs.writeNickel(cfs.pranchaFile(projectId, id), prancha);
    sceneRefs.push({ id, number: 0, shortTitle: prancha.shortTitle, file: `pranchas/${id}.ncl` });
  }

  project.pranchas = await renumberPranchas(projectId, [...keepOtherRefs, ...sceneRefs]);
  await saveProject(project);
}

async function renumberPranchas(projectId: string, refs: PranchaRef[]): Promise<PranchaRef[]> {
  const loaded: { ref: PranchaRef; prancha: Prancha; scene: number; local: number }[] = [];
  for (const ref of refs) {
    const file = cfs.pranchaFile(projectId, ref.id);
    if (!(await fs.pathExists(file))) continue;
    const prancha = await fs.readNickel<Prancha>(file);
    const m = /^scene-raw:(\d+):(\d+)$/.exec(prancha.origin);
    loaded.push({
      ref,
      prancha,
      scene: m ? Number(m[1]) : Number.MAX_SAFE_INTEGER,
      local: m ? Number(m[2]) : prancha.number,
    });
  }
  loaded.sort((a, b) => a.scene - b.scene || a.local - b.local || a.prancha.number - b.prancha.number);
  const nextRefs: PranchaRef[] = [];
  for (let i = 0; i < loaded.length; i++) {
    const item = loaded[i]!;
    const number = i + 1;
    item.prancha.number = number;
    await fs.writeNickel(cfs.pranchaFile(projectId, item.prancha.id), item.prancha);
    nextRefs.push({
      id: item.prancha.id,
      number,
      shortTitle: item.prancha.shortTitle,
      file: `pranchas/${item.prancha.id}.ncl`,
    });
  }
  return nextRefs;
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

  // Location reference assets (merge: keep generated media, refresh description).
  for (const loc of parsed.locations ?? []) {
    const locId = slugify(loc.id || loc.name);
    const existing = project.assets[locId];
    if (existing) {
      existing.characterName = loc.name;
      existing.characterDescription = loc.description;
    } else {
      project.assets[locId] = {
        id: locId,
        type: 'image',
        role: 'location',
        status: 'pending',
        characterName: loc.name,
        characterDescription: loc.description,
        file: null,
      };
    }
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
