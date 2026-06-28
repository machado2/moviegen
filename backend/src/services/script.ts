import type {
  Asset,
  JobProgress,
  ParsedScene,
  ParsedScript,
  Project,
  RawScene,
  Scene,
  SceneBreakdown,
  SceneRef,
  Shot,
} from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { parseScriptAgentic } from './parseAgent.js';
import { transformSceneAgentic } from './transformAgent.js';
import { getAiConfig } from './settings.js';
import { segmentScreenplay } from '../lib/screenplay.js';
import { jobQueue } from '../jobs/queue.js';
import { newId, slugify } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';
import { validateProject, validateScene } from '../lib/validate.js';

// ─── Script parsing (async job) ───────────────────────────────────────────────
//
// Parsing a full screenplay is a single multi-minute LLM call, so it runs as a
// background job: the route returns a jobId immediately and the client tracks
// progress over SSE. The result is persisted to disk (parsed-script.ncl) the
// moment it's ready, so it survives the client disconnecting or reloading
// before applying.

// Ref under which a project's parse job is tracked, so a reload can re-attach
// to an in-flight parse and a second click can't start a duplicate.
const parseJobRef = (projectId: string): string => `film-parse:${projectId}`;

/** Kick off a parse job (or return the one already running). */
export async function startScriptParse(projectId: string): Promise<JobProgress> {
  const project = await getProject(projectId);
  if (!(await fs.pathExists(fs.scriptFile(projectId)))) throw notFound('Stored screenplay');
  return jobQueue.start(
    'script-parse',
    async (handle) => {
      handle.update(0.05, 'Lendo o roteiro…');
      const markdown = await fs.readText(fs.scriptFile(projectId));
      // Agentic parse: the model builds the structure via tool calls, emitting a
      // live step per character/scene/shot through handle.update.
      const parsed = await parseScriptAgentic(project, markdown, handle.signal, handle.update);
      handle.update(0.96, 'Salvando resultado…');
      await fs.writeNickel(fs.parsedScriptFile(projectId), parsed);
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

// ─── Raw scenes (source layer) ────────────────────────────────────────────────
//
// Deterministic, faithful segmentation of the stored screenplay into raw scenes.
// Cheap and re-runnable (no LLM); the production Scene→Shot structure is derived
// from these by a separate per-scene transform.

/** Extract (or re-extract) the raw scenes from the stored screenplay. */
export async function extractRawScenes(projectId: string): Promise<RawScene[]> {
  await getProject(projectId);
  if (!(await fs.pathExists(fs.scriptFile(projectId)))) throw notFound('Stored screenplay');
  const markdown = await fs.readText(fs.scriptFile(projectId));
  const scenes = segmentScreenplay(markdown, 'script.md');
  // Replace any previous extraction so re-running is idempotent.
  await fs.remove(fs.rawScenesDir(projectId));
  for (const scene of scenes) {
    await fs.writeNickel(fs.rawSceneFile(projectId, scene.number), scene);
  }
  await fs.commitProject(projectId, `cenas cruas extraídas: ${scenes.length}`);
  return scenes;
}

/** List the persisted raw scenes, in script order. */
export async function listRawScenes(projectId: string): Promise<RawScene[]> {
  await getProject(projectId);
  const dir = fs.rawScenesDir(projectId);
  if (!(await fs.pathExists(dir))) return [];
  const files = await fs.listNickelFiles(dir);
  const scenes = await Promise.all(files.map((f) => fs.readNickel<RawScene>(f)));
  return scenes.sort((a, b) => a.number - b.number);
}

// ─── Per-scene transform (raw scene → shots) ──────────────────────────────────
//
// The creative step, scoped to ONE scene: incremental, reviewable and cheap to
// re-run. Produces candidate breakdowns; selecting one merges it into the
// production scene (preserving shot ids + takes), leaving the raw scene intact.

const transformJobRef = (projectId: string, n: number): string => `film-transform:${projectId}:${n}`;

/** Build the continuity/cast context for transforming scene `number`. */
async function sceneTransformContext(project: Project, number: number) {
  const cast = Object.values(project.assets)
    .filter((a) => a.role === 'character-concept')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id, description: a.description ?? '' }));
  const locations = Object.values(project.assets)
    .filter((a) => a.role === 'location')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id, description: a.description ?? '' }));
  const read = async (n: number): Promise<RawScene | null> => {
    const f = fs.rawSceneFile(project.id, n);
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

/** Kick off a per-scene transform job; persists a SceneBreakdown candidate when done. */
export async function startSceneTransform(projectId: string, number: number): Promise<JobProgress> {
  const project = await getProject(projectId);
  const rawFile = fs.rawSceneFile(projectId, number);
  if (!(await fs.pathExists(rawFile))) throw notFound('Raw scene');
  const rawScene = await fs.readNickel<RawScene>(rawFile);
  const ctx = await sceneTransformContext(project, number);
  const { parseModel } = await getAiConfig();
  return jobQueue.start(
    'scene-transform',
    async (handle) => {
      const scene = await transformSceneAgentic(project, rawScene, ctx, handle.signal, handle.update);
      const id = newId('bd');
      const breakdown: SceneBreakdown = {
        id,
        sceneNumber: number,
        createdAt: new Date().toISOString(),
        model: parseModel,
        scene,
      };
      await fs.writeNickel(fs.sceneBreakdownFile(projectId, number, id), breakdown);
      handle.update(1, `Pronto: ${scene.shots.length} shots`);
    },
    transformJobRef(projectId, number),
  );
}

/** Cancel an in-flight scene transform, if any. */
export async function cancelSceneTransform(projectId: string, number: number): Promise<boolean> {
  await getProject(projectId);
  const job = jobQueue.findActiveByRef(transformJobRef(projectId, number));
  return job ? jobQueue.cancel(job.id) : false;
}

/** The candidate breakdowns for a scene, newest first, with the selected id. */
export async function listSceneBreakdowns(
  projectId: string,
  number: number,
): Promise<{ breakdowns: SceneBreakdown[]; selectedId: string | null }> {
  await getProject(projectId);
  const dir = fs.sceneBreakdownsDir(projectId, number);
  if (!(await fs.pathExists(dir))) return { breakdowns: [], selectedId: null };
  const files = (await fs.listNickelFiles(dir)).filter((f) => !f.endsWith('selected.txt'));
  const breakdowns = await Promise.all(files.map((f) => fs.readNickel<SceneBreakdown>(f)));
  breakdowns.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const selFile = fs.sceneBreakdownSelectedFile(projectId, number);
  const selectedId = (await fs.pathExists(selFile)) ? (await fs.readText(selFile)).trim() || null : null;
  return { breakdowns, selectedId };
}

/** Apply a chosen breakdown to the production scene (merge; raw scene untouched). */
export async function selectSceneBreakdown(
  projectId: string,
  number: number,
  breakdownId: string,
): Promise<Scene> {
  await getProject(projectId);
  const file = fs.sceneBreakdownFile(projectId, number, breakdownId);
  if (!(await fs.pathExists(file))) throw notFound('Scene breakdown');
  const breakdown = await fs.readNickel<SceneBreakdown>(file);
  const scene = await applyParsedScene(projectId, breakdown.scene);
  await fs.writeText(fs.sceneBreakdownSelectedFile(projectId, number), breakdownId);
  await fs.commitProject(projectId, `cena ${number}: breakdown aplicado (${breakdown.scene.shots.length} shots)`);
  return scene;
}

/**
 * Merge a single ParsedScene into the project's production scenes, by scene
 * number and shot order — preserving existing shot ids and their takes. Creates
 * the scene if absent. Reuses the same merge rules as applyParsedScript.
 */
export async function applyParsedScene(projectId: string, ps: ParsedScene): Promise<Scene> {
  const project = await getProject(projectId);
  // Valid ref targets: character-concept and location asset ids (== their slug).
  const refIds = new Set(
    Object.values(project.assets)
      .filter((a) => a.role === 'character-concept' || a.role === 'location')
      .map((a) => a.id),
  );
  const shotRefs = (shot: ParsedScene['shots'][number]): Shot['refs'] =>
    (shot.characterIds ?? [])
      .map((cid) => slugify(cid))
      .filter((id) => refIds.has(id))
      .map((assetId) => ({ assetId, required: true }));

  const existingRef = project.scenes.find((r) => r.number === ps.number);
  let existing: Scene | null = null;
  if (existingRef && (await fs.pathExists(fs.sceneFile(projectId, existingRef.id)))) {
    existing = await fs.readNickel<Scene>(fs.sceneFile(projectId, existingRef.id));
  }

  const buildShot = (shot: ParsedScene['shots'][number], prev?: Shot): Shot => ({
    id: prev?.id ?? newId('shot'),
    order: shot.order,
    targetDuration: shot.targetDuration || prev?.targetDuration || '15s',
    camera: shot.camera,
    action: shot.action,
    exit: shot.exit,
    diegeticTexts: shot.diegeticTexts ?? [],
    sounds: shot.sounds ?? [],
    lines: shot.lines ?? [],
    refs: shotRefs(shot),
    selectedTakeId: prev?.selectedTakeId ?? null,
    takes: prev?.takes ?? [],
  });

  let scene: Scene;
  if (existing) {
    const byOrder = new Map(existing.shots.map((s) => [s.order, s]));
    const parsedOrders = new Set(ps.shots.map((s) => s.order));
    const merged = ps.shots.map((s) => buildShot(s, byOrder.get(s.order)));
    for (const s of existing.shots) if (!parsedOrders.has(s.order)) merged.push(s);
    merged.sort((a, b) => a.order - b.order);
    scene = {
      ...existing,
      shortTitle: ps.shortTitle || existing.shortTitle,
      slugTitle: ps.slugTitle || existing.slugTitle,
      summary: ps.summary || existing.summary,
      continuity: { in: ps.continuityIn, out: ps.continuityOut },
      shots: merged,
    };
  } else {
    const id = `scene-${ps.number}-${slugify(ps.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
    scene = {
      id,
      number: ps.number,
      shortTitle: ps.shortTitle || `Cena ${ps.number}`,
      slugTitle: ps.slugTitle ?? '',
      targetDuration: '',
      summary: ps.summary ?? '',
      continuity: { in: ps.continuityIn ?? '', out: ps.continuityOut ?? '' },
      refs: [],
      shots: ps.shots.map((s) => buildShot(s)),
    };
  }
  await fs.writeNickel(fs.sceneFile(projectId, scene.id), scene);
  const ref: SceneRef = { id: scene.id, number: scene.number, shortTitle: scene.shortTitle, file: `scenes/${scene.id}.ncl` };
  const others = project.scenes.filter((r) => r.number !== scene.number);
  project.scenes = [...others, ref].sort((a, b) => a.number - b.number);
  await saveProject(project);
  return scene;
}

/** The last parsed-but-not-yet-applied script, or null if none is pending. */
export async function getParsedScript(projectId: string): Promise<ParsedScript | null> {
  await getProject(projectId);
  if (!(await fs.pathExists(fs.parsedScriptFile(projectId)))) return null;
  return fs.readNickel<ParsedScript>(fs.parsedScriptFile(projectId));
}

/** Discard a pending parsed script (e.g. after it has been applied). */
export async function clearParsedScript(projectId: string): Promise<void> {
  await fs.remove(fs.parsedScriptFile(projectId));
}

/** The parse job currently running for this project, or null. */
export async function getActiveParseJob(projectId: string): Promise<JobProgress | null> {
  await getProject(projectId);
  return jobQueue.findActiveByRef(parseJobRef(projectId)) ?? null;
}

/**
 * Apply a reviewed ParsedScript to a project by MERGING it into the existing
 * structure, never destructively replacing it — so a re-parse cannot lose
 * generated takes, paid media, or manual edits.
 *
 *  - Scenes are matched by `number`: a matched scene keeps its id and file, and
 *    only its descriptive fields are refreshed.
 *  - Shots are matched by `order` within a matched scene: a matched shot keeps
 *    its id, takes, and selectedTakeId; its descriptive fields are refreshed.
 *    A shot order present on disk but absent from the parse is kept untouched.
 *  - A parsed scene with a brand-new number is created fresh; an existing scene
 *    whose number is absent from the parse is left untouched.
 *  - Character/voice assets are upserted by their stable slug id: an existing
 *    asset keeps its status, file, prompt, and variants/selectedVariantId (its
 *    generated image/voice), refreshing only the descriptive fields. Only
 *    brand-new characters get a pending asset.
 */
export async function applyParsedScript(projectId: string, parsed: ParsedScript): Promise<Project> {
  const project = await getProject(projectId);

  project.title = parsed.title || project.title;
  project.language = parsed.language || project.language;
  if (parsed.globalStyle) project.globalStyle = parsed.globalStyle;

  // Upsert character assets. Concept asset id is the character slug for stable
  // refs. An already-present asset keeps its generated media (status/file/
  // prompt/variants) — we only refresh the descriptive fields, so re-parsing
  // never resets a generated character image/voice back to pending.
  const conceptIdByChar = new Map<string, string>();
  for (const c of parsed.characters) {
    const charSlug = slugify(c.id || c.name);
    const conceptId = charSlug; // stable, human-readable
    const voiceId = `${charSlug}-voice`;

    const existingConcept = project.assets[conceptId];
    if (existingConcept) {
      existingConcept.characterName = c.name;
      existingConcept.description = c.description;
    } else {
      project.assets[conceptId] = {
        id: conceptId,
        type: 'image',
        role: 'character-concept',
        status: 'pending',
        file: null,
        prompt: 'Reference image for {ref}.',
        characterName: c.name,
        description: c.description,
      };
    }

    const existingVoice = project.assets[voiceId];
    if (existingVoice) {
      existingVoice.characterName = c.name;
      existingVoice.description = c.voiceDescription;
    } else {
      project.assets[voiceId] = {
        id: voiceId,
        type: 'audio',
        role: 'voice',
        status: 'pending',
        file: null,
        prompt: 'Voice timbre sample for {ref}.',
        characterName: c.name,
        description: c.voiceDescription,
      };
    }
    conceptIdByChar.set(charSlug, conceptId);
  }

  // Location reference assets (merge: keep generated media, refresh description).
  for (const loc of parsed.locations ?? []) {
    const locId = slugify(loc.id || loc.name);
    const existing = project.assets[locId];
    if (existing) {
      existing.characterName = loc.name;
      existing.description = loc.description;
    } else {
      project.assets[locId] = {
        id: locId,
        type: 'image',
        role: 'location',
        status: 'pending',
        file: null,
        prompt: 'Reference image for {ref}.',
        characterName: loc.name,
        description: loc.description,
      };
    }
  }

  // Map the parsed shot's character ids to asset refs.
  const shotRefs = (shot: ParsedScript['scenes'][number]['shots'][number]): Shot['refs'] =>
    (shot.characterIds ?? [])
      .map((cid) => conceptIdByChar.get(slugify(cid)))
      .filter((id): id is string => Boolean(id))
      .map((assetId) => ({ assetId, required: true }));

  // Read existing scenes (by number) so we can merge into them in place.
  const existingByNumber = new Map<number, Scene>();
  for (const ref of project.scenes) {
    const file = fs.sceneFile(projectId, ref.id);
    if (await fs.pathExists(file)) {
      const scene = await fs.readNickel<Scene>(file);
      existingByNumber.set(scene.number, scene);
    }
  }

  const sceneRefs: SceneRef[] = [];
  const parsedNumbers = new Set<number>();
  for (const ps of parsed.scenes) {
    parsedNumbers.add(ps.number);
    const existing = existingByNumber.get(ps.number);

    if (existing) {
      // Matched scene: keep id + file, refresh descriptive fields, merge shots.
      const existingByOrder = new Map<number, Shot>();
      for (const s of existing.shots) existingByOrder.set(s.order, s);
      const parsedOrders = new Set<number>();
      const mergedShots: Shot[] = [];
      for (const shot of ps.shots) {
        parsedOrders.add(shot.order);
        const ex = existingByOrder.get(shot.order);
        if (ex) {
          // Keep id, takes, selectedTakeId; refresh descriptive fields.
          mergedShots.push({
            ...ex,
            order: shot.order,
            targetDuration: shot.targetDuration || ex.targetDuration || '15s',
            camera: shot.camera,
            action: shot.action,
            exit: shot.exit,
            diegeticTexts: shot.diegeticTexts ?? [],
            sounds: shot.sounds ?? [],
            lines: shot.lines ?? [],
            refs: shotRefs(shot),
          });
        } else {
          mergedShots.push({
            id: newId('shot'),
            order: shot.order,
            targetDuration: shot.targetDuration || '15s',
            camera: shot.camera,
            action: shot.action,
            exit: shot.exit,
            diegeticTexts: shot.diegeticTexts ?? [],
            sounds: shot.sounds ?? [],
            lines: shot.lines ?? [],
            refs: shotRefs(shot),
            selectedTakeId: null,
            takes: [],
          });
        }
      }
      // Keep existing shots the parse no longer mentions (their takes survive).
      for (const s of existing.shots) {
        if (!parsedOrders.has(s.order)) mergedShots.push(s);
      }
      mergedShots.sort((a, b) => a.order - b.order);
      const merged: Scene = {
        ...existing,
        shortTitle: ps.shortTitle,
        slugTitle: ps.slugTitle,
        summary: ps.summary,
        continuity: { in: ps.continuityIn, out: ps.continuityOut },
        shots: mergedShots,
      };
      await fs.writeNickel(fs.sceneFile(projectId, existing.id), merged);
      sceneRefs.push({ id: existing.id, number: existing.number, shortTitle: ps.shortTitle, file: `scenes/${existing.id}.ncl` });
    } else {
      // Brand-new scene number: create fresh.
      const sceneId = `scene-${ps.number}-${slugify(ps.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
      const shots: Shot[] = ps.shots.map((shot) => ({
        id: newId('shot'),
        order: shot.order,
        targetDuration: shot.targetDuration || '15s',
        camera: shot.camera,
        action: shot.action,
        exit: shot.exit,
        diegeticTexts: shot.diegeticTexts ?? [],
        sounds: shot.sounds ?? [],
        lines: shot.lines ?? [],
        refs: shotRefs(shot),
        selectedTakeId: null,
        takes: [],
      }));
      shots.sort((a, b) => a.order - b.order);
      const scene: Scene = {
        id: sceneId,
        number: ps.number,
        shortTitle: ps.shortTitle,
        slugTitle: ps.slugTitle,
        targetDuration: '',
        summary: ps.summary,
        continuity: { in: ps.continuityIn, out: ps.continuityOut },
        refs: [],
        shots,
      };
      await fs.writeNickel(fs.sceneFile(projectId, sceneId), scene);
      sceneRefs.push({ id: sceneId, number: ps.number, shortTitle: ps.shortTitle, file: `scenes/${sceneId}.ncl` });
    }
  }

  // Keep existing scenes the parse no longer mentions, untouched.
  for (const ref of project.scenes) {
    if (!parsedNumbers.has(ref.number)) sceneRefs.push(ref);
  }

  sceneRefs.sort((a, b) => a.number - b.number);
  project.scenes = sceneRefs;
  const saved = await saveProject(project);
  // The pending parse has been consumed; drop it so the UI doesn't re-offer it.
  await clearParsedScript(projectId);
  await fs.commitProject(
    projectId,
    `parse mesclado: ${parsed.scenes.length} cenas · ${parsed.characters.length} personagens`,
  );
  return saved;
}

// Structured import: a full Project plus (optionally) full scene contents.
// Replaces the structure of the existing project at `projectId` (keeping its id
// and stored API key). Validates strictly against the current types first.
export type StructuredImportPayload = Project & { scenesData?: Scene[] };

export async function structuredImport(projectId: string, payload: unknown): Promise<Project> {
  if (typeof payload !== 'object' || payload === null) {
    throw badRequest('Structured import payload must be an object');
  }
  const existing = await getProject(projectId); // 404 if target missing
  const { scenesData, ...projectLike } = payload as StructuredImportPayload;

  const projectErrors = validateProject(projectLike);
  if (projectErrors.length) {
    throw badRequest('Project JSON does not match the current format', projectErrors.slice(0, 30));
  }
  const incoming = projectLike as Project;

  // Validate any embedded scenes against the current Scene type.
  const sceneErrors: string[] = [];
  (scenesData ?? []).forEach((s, i) => sceneErrors.push(...validateScene(s, `scenesData[${i}]`)));
  if (sceneErrors.length) {
    throw badRequest('Scene JSON does not match the current format', sceneErrors.slice(0, 30));
  }

  // Replace structure but preserve identity of the target project.
  const project: Project = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };

  // Reset scene files, then write the imported ones.
  await fs.remove(fs.scenesDir(projectId));
  const byId = new Map((scenesData ?? []).map((s) => [s.id, s]));
  const refs: SceneRef[] = [];
  for (const ref of incoming.scenes) {
    const scene = byId.get(ref.id);
    if (scene) {
      await fs.writeNickel(fs.sceneFile(project.id, scene.id), scene);
      refs.push({ id: scene.id, number: scene.number, shortTitle: scene.shortTitle, file: `scenes/${scene.id}.ncl` });
    } else {
      // Keep the ref even if scene body wasn't provided (matches "no silent compat").
      refs.push(ref);
    }
  }
  refs.sort((a, b) => a.number - b.number);
  project.scenes = refs;
  const saved = await saveProject(project);
  await fs.commitProject(projectId, 'projeto importado');
  return saved;
}
