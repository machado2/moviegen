import type { Take } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getScene, saveScene } from './scene.js';
import { newId, nowIso } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';
import { probe } from '../assembly/probe.js';

export async function listTakes(projectId: string, sceneId: string, shotId: string): Promise<Take[]> {
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');
  return shot.takes;
}

export interface AddTakeInput {
  data: Buffer;
  originalName: string;
  source: 'upload' | 'generated';
  generationPrompt?: string;
  notes?: string;
  /** Select this take if the shot has none yet. Upload → true; API generation → false. */
  autoSelect?: boolean;
}

export async function addTake(
  projectId: string,
  sceneId: string,
  shotId: string,
  input: AddTakeInput,
): Promise<Take> {
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');

  const takeId = newId('take');
  const filename = fs.takeFilename(takeId, input.originalName);
  const absPath = fs.takeFile(projectId, sceneId, shotId, filename);
  await fs.writeBuffer(absPath, input.data);

  let durationSeconds: number | null = null;
  try {
    const info = await probe(absPath);
    durationSeconds = info.durationSeconds;
  } catch {
    durationSeconds = null; // probing is best-effort
  }

  const take: Take = {
    id: takeId,
    shotId,
    createdAt: nowIso(),
    filename,
    fileSizeBytes: input.data.byteLength,
    durationSeconds,
    source: input.source,
    generationPrompt: input.generationPrompt,
    notes: input.notes,
  };
  shot.takes.push(take);
  // Upload selects the first take for convenience; API generation never
  // auto-selects (the user reviews candidates and picks one explicitly).
  if (input.autoSelect !== false && !shot.selectedTakeId) shot.selectedTakeId = take.id;
  await saveScene(projectId, scene);
  await fs.commitProject(projectId, `take: cena ${scene.number} · shot ${shot.order}`);
  return take;
}

export async function getTakeAbsolutePath(
  projectId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
): Promise<{ path: string; take: Take }> {
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');
  const take = shot.takes.find((t) => t.id === takeId);
  if (!take) throw notFound('Take');
  return { path: fs.takeFile(projectId, sceneId, shotId, take.filename), take };
}

export async function deleteTake(
  projectId: string,
  sceneId: string,
  shotId: string,
  takeId: string,
): Promise<void> {
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');
  const take = shot.takes.find((t) => t.id === takeId);
  if (!take) throw notFound('Take');
  shot.takes = shot.takes.filter((t) => t.id !== takeId);
  if (shot.selectedTakeId === takeId) {
    shot.selectedTakeId = shot.takes[0]?.id ?? null;
  }
  await saveScene(projectId, scene);
  await fs.remove(fs.takeFile(projectId, sceneId, shotId, take.filename));
  await fs.commitProject(projectId, `take removido: cena ${scene.number} · shot ${shot.order}`);
}

export async function selectTake(
  projectId: string,
  sceneId: string,
  shotId: string,
  takeId: string | null,
): Promise<void> {
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');
  if (takeId !== null && !shot.takes.some((t) => t.id === takeId)) {
    throw badRequest('No such take on this shot');
  }
  shot.selectedTakeId = takeId;
  await saveScene(projectId, scene);
  await fs.commitProject(projectId, `seleção de take: cena ${scene.number} · shot ${shot.order}`);
}
