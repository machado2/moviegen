import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, remove } from '../storage/filesystem.js';
import { normalizeTake } from './normalize.js';
import { concatFiles } from './concat.js';

export type ProgressFn = (progress: number, message: string) => void;

const MAX_CONCURRENT = 4;

/** Run an async mapper over items with bounded concurrency, preserving order. */
async function mapBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Scene assembly: normalize every selected take (bounded concurrency), then
 * concatenate in order. `takePaths` must already be ordered by shot.order.
 */
export async function assembleScene(
  takePaths: string[],
  outputPath: string,
  onProgress: ProgressFn = () => {},
): Promise<void> {
  if (takePaths.length === 0) throw new Error('No takes to assemble');
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mediagen-scene-'));
  try {
    onProgress(0.02, `Normalizing ${takePaths.length} takes…`);
    let done = 0;
    const normalized = await mapBounded(takePaths, MAX_CONCURRENT, async (takePath) => {
      const out = await normalizeTake(takePath, workDir);
      done++;
      // Normalization is ~90% of the work.
      onProgress(0.02 + 0.88 * (done / takePaths.length), `Normalized ${done}/${takePaths.length}`);
      return out;
    });

    onProgress(0.92, 'Concatenating…');
    await ensureDir(path.dirname(outputPath));
    await concatFiles(normalized, outputPath, workDir);
    onProgress(1, 'Scene assembled');
  } finally {
    await remove(workDir);
  }
}

/**
 * Movie assembly: scene outputs are already normalized, so just concat them.
 * `sceneOutputs` must be ordered by scene.number.
 */
export async function assembleMovie(
  sceneOutputs: string[],
  outputPath: string,
  onProgress: ProgressFn = () => {},
): Promise<void> {
  if (sceneOutputs.length === 0) throw new Error('No assembled scenes to join');
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mediagen-movie-'));
  try {
    onProgress(0.1, `Joining ${sceneOutputs.length} scenes…`);
    await ensureDir(path.dirname(outputPath));
    await concatFiles(sceneOutputs, outputPath, workDir);
    onProgress(1, 'Movie assembled');
  } finally {
    await remove(workDir);
  }
}
