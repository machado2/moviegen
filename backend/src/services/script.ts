import type {
  Asset,
  JobProgress,
  ParsedScript,
  Project,
  Scene,
  SceneRef,
  Shot,
} from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { parseScript } from './ai.js';
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
      handle.update(0.05, 'Reading screenplay');
      const markdown = await fs.readText(fs.scriptFile(projectId));
      handle.update(0.15, 'Parsing screenplay with the model (this can take a few minutes)');
      const parsed = await parseScript(project, markdown);
      handle.update(0.95, 'Saving result');
      await fs.writeNickel(fs.parsedScriptFile(projectId), parsed);
    },
    parseJobRef(projectId),
  );
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
 * Apply a reviewed ParsedScript to a project: create character assets (pending),
 * voice assets (pending), and the scenes + shots. This replaces any existing
 * scene structure (additive takes are not affected because new scenes are new).
 */
export async function applyParsedScript(projectId: string, parsed: ParsedScript): Promise<Project> {
  const project = await getProject(projectId);

  project.title = parsed.title || project.title;
  project.language = parsed.language || project.language;
  if (parsed.globalStyle) project.globalStyle = parsed.globalStyle;

  // Build character assets. Concept asset id is the character slug for stable refs.
  const conceptIdByChar = new Map<string, string>();
  for (const c of parsed.characters) {
    const charSlug = slugify(c.id || c.name);
    const conceptId = charSlug; // stable, human-readable
    const conceptAsset: Asset = {
      id: conceptId,
      type: 'image',
      role: 'character-concept',
      status: 'pending',
      file: null,
      prompt: 'Reference image for {ref}.',
      characterName: c.name,
      description: c.description,
    };
    const voiceAsset: Asset = {
      id: `${charSlug}-voice`,
      type: 'audio',
      role: 'voice',
      status: 'pending',
      file: null,
      prompt: 'Voice timbre sample for {ref}.',
      characterName: c.name,
      description: c.voiceDescription,
    };
    project.assets[conceptAsset.id] = conceptAsset;
    project.assets[voiceAsset.id] = voiceAsset;
    conceptIdByChar.set(charSlug, conceptId);
  }

  // Build scenes + shots and write each scene file.
  const sceneRefs: SceneRef[] = [];
  for (const ps of parsed.scenes) {
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
      refs: (shot.characterIds ?? [])
        .map((cid) => conceptIdByChar.get(slugify(cid)))
        .filter((id): id is string => Boolean(id))
        .map((assetId) => ({ assetId, required: true })),
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
  sceneRefs.sort((a, b) => a.number - b.number);
  project.scenes = sceneRefs;
  const saved = await saveProject(project);
  // The pending parse has been consumed; drop it so the UI doesn't re-offer it.
  await clearParsedScript(projectId);
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

  // Replace structure but preserve identity and secrets of the target project.
  const project: Project = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    openrouterApiKey: existing.openrouterApiKey ?? null,
    parseModel: incoming.parseModel ?? existing.parseModel,
    ttsModel: incoming.ttsModel ?? existing.ttsModel,
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
  return saveProject(project);
}
