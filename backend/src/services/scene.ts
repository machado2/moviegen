import type { Scene, SceneRef, Shot } from '@moviegen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, slugify } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';
import { MAX_SHOT_SECONDS } from '../config.js';

export async function listSceneRefs(projectId: string): Promise<SceneRef[]> {
  const project = await getProject(projectId);
  return [...project.scenes].sort((a, b) => a.number - b.number);
}

export async function getScene(projectId: string, sceneId: string): Promise<Scene> {
  const file = fs.sceneFile(projectId, sceneId);
  if (!(await fs.pathExists(file))) throw notFound('Scene');
  return fs.readJson<Scene>(file);
}

export async function saveScene(projectId: string, scene: Scene): Promise<Scene> {
  await fs.writeJson(fs.sceneFile(projectId, scene.id), scene);
  // Keep the SceneRef index in the project in sync.
  const project = await getProject(projectId);
  const ref: SceneRef = {
    id: scene.id,
    number: scene.number,
    shortTitle: scene.shortTitle,
    file: `scenes/${scene.id}.json`,
  };
  const idx = project.scenes.findIndex((s) => s.id === scene.id);
  if (idx === -1) project.scenes.push(ref);
  else project.scenes[idx] = ref;
  project.scenes.sort((a, b) => a.number - b.number);
  await saveProject(project);
  return scene;
}

export interface CreateSceneInput {
  number?: number;
  shortTitle: string;
  slugTitle?: string;
  targetDuration?: string;
  summary?: string;
  continuityIn?: string;
  continuityOut?: string;
}

export async function createScene(projectId: string, input: CreateSceneInput): Promise<Scene> {
  const project = await getProject(projectId);
  const number = input.number ?? (project.scenes.reduce((m, s) => Math.max(m, s.number), 0) + 1);
  const id = `scene-${number}-${slugify(input.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
  const scene: Scene = {
    id,
    number,
    shortTitle: input.shortTitle,
    slugTitle: input.slugTitle ?? '',
    targetDuration: input.targetDuration ?? '',
    summary: input.summary ?? '',
    continuity: { in: input.continuityIn ?? '', out: input.continuityOut ?? '' },
    refs: [],
    shots: [],
  };
  return saveScene(projectId, scene);
}

export interface UpdateSceneInput {
  number?: number;
  shortTitle?: string;
  slugTitle?: string;
  targetDuration?: string;
  summary?: string;
  continuity?: { in: string; out: string };
  refs?: Scene['refs'];
}

export async function updateScene(
  projectId: string,
  sceneId: string,
  patch: UpdateSceneInput,
): Promise<Scene> {
  const scene = await getScene(projectId, sceneId);
  if (patch.number !== undefined) scene.number = patch.number;
  if (patch.shortTitle !== undefined) scene.shortTitle = patch.shortTitle;
  if (patch.slugTitle !== undefined) scene.slugTitle = patch.slugTitle;
  if (patch.targetDuration !== undefined) scene.targetDuration = patch.targetDuration;
  if (patch.summary !== undefined) scene.summary = patch.summary;
  if (patch.continuity !== undefined) scene.continuity = patch.continuity;
  if (patch.refs !== undefined) scene.refs = patch.refs;
  return saveScene(projectId, scene);
}

export async function deleteScene(projectId: string, sceneId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project.scenes.some((s) => s.id === sceneId)) throw notFound('Scene');
  project.scenes = project.scenes.filter((s) => s.id !== sceneId);
  await saveProject(project);
  await fs.remove(fs.sceneFile(projectId, sceneId));
  await fs.remove(fs.sceneTakesDir(projectId, sceneId));
  await fs.remove(fs.sceneOutputFile(projectId, sceneId));
}

export async function reorderScenes(projectId: string, orderedIds: string[]): Promise<SceneRef[]> {
  const project = await getProject(projectId);
  const known = new Set(project.scenes.map((s) => s.id));
  if (orderedIds.length !== project.scenes.length || orderedIds.some((id) => !known.has(id))) {
    throw badRequest('Reorder list must contain exactly the existing scene ids');
  }
  // Renumber by position and persist each scene file.
  for (let i = 0; i < orderedIds.length; i++) {
    const sceneId = orderedIds[i]!;
    const scene = await getScene(projectId, sceneId);
    scene.number = i + 1;
    await fs.writeJson(fs.sceneFile(projectId, scene.id), scene);
  }
  const refreshed = await getProject(projectId);
  refreshed.scenes = orderedIds.map((id, i) => {
    const ref = refreshed.scenes.find((s) => s.id === id)!;
    return { ...ref, number: i + 1 };
  });
  await saveProject(refreshed);
  return refreshed.scenes;
}

// ─── Shots ──────────────────────────────────────────────────────────────────

function clampDuration(targetDuration: string): string {
  const m = /([\d.]+)/.exec(targetDuration);
  if (!m) return targetDuration;
  const secs = Number(m[1]);
  if (Number.isFinite(secs) && secs > MAX_SHOT_SECONDS) return `${MAX_SHOT_SECONDS}s`;
  return targetDuration;
}

export interface CreateShotInput {
  order?: number;
  targetDuration?: string;
  camera?: string;
  action?: string;
  exit?: string;
  diegeticTexts?: string[];
  sounds?: string[];
  lines?: Shot['lines'];
  refs?: Shot['refs'];
}

export async function addShot(projectId: string, sceneId: string, input: CreateShotInput): Promise<Shot> {
  const scene = await getScene(projectId, sceneId);
  const order = input.order ?? (scene.shots.reduce((m, s) => Math.max(m, s.order), 0) + 1);
  const shot: Shot = {
    id: newId('shot'),
    order,
    targetDuration: clampDuration(input.targetDuration ?? `${MAX_SHOT_SECONDS}s`),
    camera: input.camera ?? '',
    action: input.action ?? '',
    exit: input.exit ?? '',
    diegeticTexts: input.diegeticTexts ?? [],
    sounds: input.sounds ?? [],
    lines: input.lines ?? [],
    refs: input.refs ?? [],
    selectedTakeId: null,
    takes: [],
  };
  scene.shots.push(shot);
  scene.shots.sort((a, b) => a.order - b.order);
  await saveScene(projectId, scene);
  return shot;
}

export type UpdateShotInput = Partial<Omit<Shot, 'id' | 'takes' | 'selectedTakeId'>>;

export async function updateShot(
  projectId: string,
  sceneId: string,
  shotId: string,
  patch: UpdateShotInput,
): Promise<Shot> {
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');
  Object.assign(shot, patch);
  if (patch.targetDuration !== undefined) shot.targetDuration = clampDuration(patch.targetDuration);
  scene.shots.sort((a, b) => a.order - b.order);
  await saveScene(projectId, scene);
  return shot;
}

export async function deleteShot(projectId: string, sceneId: string, shotId: string): Promise<void> {
  const scene = await getScene(projectId, sceneId);
  if (!scene.shots.some((s) => s.id === shotId)) throw notFound('Shot');
  scene.shots = scene.shots.filter((s) => s.id !== shotId);
  await saveScene(projectId, scene);
  await fs.remove(fs.takesDir(projectId, sceneId, shotId));
}

export async function reorderShots(
  projectId: string,
  sceneId: string,
  orderedIds: string[],
): Promise<Shot[]> {
  const scene = await getScene(projectId, sceneId);
  const known = new Set(scene.shots.map((s) => s.id));
  if (orderedIds.length !== scene.shots.length || orderedIds.some((id) => !known.has(id))) {
    throw badRequest('Reorder list must contain exactly the existing shot ids');
  }
  const byId = new Map(scene.shots.map((s) => [s.id, s]));
  scene.shots = orderedIds.map((id, i) => {
    const shot = byId.get(id)!;
    shot.order = i + 1;
    return shot;
  });
  await saveScene(projectId, scene);
  return scene.shots;
}
