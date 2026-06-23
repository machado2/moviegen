import type {
  Asset,
  ParsedScript,
  Project,
  Scene,
  SceneRef,
  Shot,
} from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, slugify } from '../lib/ids.js';
import { badRequest } from '../lib/errors.js';
import { validateProject, validateScene } from '../lib/validate.js';

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
  return saveProject(project);
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
