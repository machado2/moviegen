import type {
  JobProgress,
  MovieAssemblyStatus,
  Scene,
  SceneAssemblyStatus,
} from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject } from './project.js';
import { getScene, listSceneRefs } from './scene.js';
import { assembleScene, assembleMovie } from '../assembly/assemble.js';
import { jobQueue } from '../jobs/queue.js';
import { badRequest } from '../lib/errors.js';

/** Ordered selected-take paths for a scene, plus the orders of missing shots. */
async function selectedTakePaths(
  projectId: string,
  scene: Scene,
): Promise<{ paths: string[]; missing: number[]; newestInputMs: number }> {
  const ordered = [...scene.shots].sort((a, b) => a.order - b.order);
  const paths: string[] = [];
  const missing: number[] = [];
  let newestInputMs = 0;

  const sceneStat = await fs.statFile(fs.sceneFile(projectId, scene.id));
  if (sceneStat) newestInputMs = Math.max(newestInputMs, sceneStat.mtime.getTime());

  for (const shot of ordered) {
    const take = shot.selectedTakeId ? shot.takes.find((t) => t.id === shot.selectedTakeId) : undefined;
    if (!take) {
      missing.push(shot.order);
      continue;
    }
    const p = fs.takeFile(projectId, scene.id, shot.id, take.filename);
    paths.push(p);
    const st = await fs.statFile(p);
    if (st) newestInputMs = Math.max(newestInputMs, st.mtime.getTime());
  }
  return { paths, missing, newestInputMs };
}

export async function sceneStatus(projectId: string, sceneId: string): Promise<SceneAssemblyStatus> {
  const scene = await getScene(projectId, sceneId);
  const { paths, missing, newestInputMs } = await selectedTakePaths(projectId, scene);
  const shotsWithTake = scene.shots.length - missing.length;
  const ready = scene.shots.length > 0 && missing.length === 0;

  const outStat = await fs.statFile(fs.sceneOutputFile(projectId, sceneId));
  let state: SceneAssemblyStatus['state'] = 'not-assembled';
  if (outStat) {
    state = outStat.mtime.getTime() >= newestInputMs ? 'assembled' : 'stale';
  }

  return {
    sceneId,
    number: scene.number,
    shortTitle: scene.shortTitle,
    shotCount: scene.shots.length,
    shotsWithTake,
    ready,
    missingShots: missing,
    state,
    outputAt: outStat ? outStat.mtime.toISOString() : null,
  };
}

export async function getMovieStatus(projectId: string): Promise<MovieAssemblyStatus> {
  const refs = await listSceneRefs(projectId);
  const scenes: SceneAssemblyStatus[] = [];
  for (const ref of refs) scenes.push(await sceneStatus(projectId, ref.id));
  const ready = scenes.length > 0 && scenes.every((s) => s.state === 'assembled');
  const movieStat = await fs.statFile(fs.movieOutputFile(projectId));
  return { scenes, ready, movieAt: movieStat ? movieStat.mtime.toISOString() : null };
}

export async function startSceneAssembly(projectId: string, sceneId: string): Promise<JobProgress> {
  const scene = await getScene(projectId, sceneId);
  const { paths, missing } = await selectedTakePaths(projectId, scene);
  if (scene.shots.length === 0) throw badRequest('Scene has no shots');
  if (missing.length) {
    throw badRequest(
      `Cannot assemble: ${missing.length} shot(s) have no selected take`,
      missing.map((o) => `shot order ${o}`),
    );
  }
  const outputPath = fs.sceneOutputFile(projectId, sceneId);
  return jobQueue.start('scene-assembly', async (handle) => {
    await assembleScene(paths, outputPath, (p, m) => handle.update(p, m));
    await fs.commitProject(projectId, `montagem: cena ${scene.number} · ${scene.shortTitle}`);
  });
}

export async function startMovieAssembly(projectId: string): Promise<JobProgress> {
  await getProject(projectId); // existence check
  const refs = await listSceneRefs(projectId);
  if (refs.length === 0) throw badRequest('Project has no scenes');

  const outputs: string[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const p = fs.sceneOutputFile(projectId, ref.id);
    if (await fs.pathExists(p)) outputs.push(p);
    else missing.push(`scene ${ref.number} (${ref.shortTitle})`);
  }
  if (missing.length) {
    throw badRequest(`Cannot assemble movie: ${missing.length} scene(s) not assembled`, missing);
  }

  const outputPath = fs.movieOutputFile(projectId);
  return jobQueue.start('movie-assembly', async (handle) => {
    await assembleMovie(outputs, outputPath, (p, m) => handle.update(p, m));
    await fs.commitProject(projectId, 'montagem: filme completo');
  });
}
