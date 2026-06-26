// API-mode generation of a shot's video clip through the LiteLLM gateway (Veo).
// Runs as a job: the gateway call is asynchronous (create → poll → download), so
// the job's progress mirrors the polling and the result is saved as a take.

import type { JobProgress } from '@mediagen/types';
import { shotPrompt } from '@mediagen/core';
import { getProject } from './project.js';
import { getScene } from './scene.js';
import { addTake } from './take.js';
import { getAiConfig } from './settings.js';
import { generateVideoViaGateway } from './videogen.js';
import { assertUnderCap, recordSpend } from './spend.js';
import { jobQueue } from '../jobs/queue.js';
import { badRequest, notFound } from '../lib/errors.js';
import { projectDir } from '../storage/filesystem.js';

export interface ShotVideoGenerationOptions {
  /** Video model id to route through the gateway. Defaults to the first configured one. */
  model?: string;
  /** The copy-paste-ready prompt built by the Estúdio; falls back to a template. */
  prompt?: string;
  /** Duration in seconds (provider-capped). */
  seconds?: number;
  /** Frame size, e.g. "1280x720". */
  size?: string;
}

export async function startShotVideoGeneration(
  projectId: string,
  sceneId: string,
  shotId: string,
  opts: ShotVideoGenerationOptions = {},
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const scene = await getScene(projectId, sceneId);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) throw notFound('Shot');

  const prompt = opts.prompt?.trim() || shotPrompt(project, scene, shot);

  const { apiKey, spendCapUsd, videoModels } = await getAiConfig();
  const model = opts.model || videoModels[0];
  if (!model) {
    throw badRequest(
      'Nenhum modelo de vídeo configurado. Adicione um id de modelo (ex.: gemini/veo-3.0-generate-preview) em Configurações.',
    );
  }
  const dir = projectDir(projectId);
  await assertUnderCap(dir, spendCapUsd);

  return jobQueue.start('video-generate', async (handle) => {
    handle.update(0.05, `Gerando vídeo via ${model}…`);
    const { mp4, spend } = await generateVideoViaGateway({
      apiKey,
      model,
      prompt,
      seconds: opts.seconds,
      size: opts.size,
      signal: handle.signal,
      onProgress: (f, m) => handle.update(f, m),
    });
    await recordSpend(dir, spend);
    handle.update(0.95, 'Salvando candidato…');
    // Accumulate as a take without selecting it; the user picks in the Estúdio.
    await addTake(projectId, sceneId, shotId, {
      data: mp4,
      originalName: 'generated.mp4',
      source: 'generated',
      generationPrompt: prompt,
      autoSelect: false,
    });
    handle.update(1, 'Vídeo gerado');
  });
}
