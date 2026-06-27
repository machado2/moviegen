// API-mode generation of reference images (character sheets, locations) through
// the LiteLLM gateway. Mirrors the comics render generation, but writes the
// result as the asset's own file. Runs as a job so a slow image call doesn't
// hold an HTTP request open and the UI can follow progress over SSE.

import type { JobProgress } from '@mediagen/types';
import { filmReferencePrompt } from '@mediagen/core';
import { getProject } from './project.js';
import { addAssetVariant, getAsset } from './asset.js';
import { getAiConfig } from './settings.js';
import { generateImageViaGateway } from './imagegen.js';
import { recordSpend, withSpendGuard } from './spend.js';
import { jobQueue } from '../jobs/queue.js';
import { badRequest } from '../lib/errors.js';
import { projectDir } from '../storage/filesystem.js';

export interface AssetImageGenerationOptions {
  /** Image model id to route through the gateway. Defaults to the first configured one. */
  model?: string;
  /** The copy-paste-ready prompt built by the Estúdio; falls back to a template. */
  prompt?: string;
}

export async function startAssetImageGeneration(
  projectId: string,
  assetId: string,
  opts: AssetImageGenerationOptions = {},
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const asset = await getAsset(projectId, assetId);
  if (asset.type !== 'image') {
    throw badRequest('Só assets de imagem podem ser gerados por API; envie um arquivo para os demais.');
  }

  const prompt = opts.prompt?.trim() || filmReferencePrompt(project, asset);

  const { apiKey, spendCapUsd, imageModels } = await getAiConfig();
  const model = opts.model || imageModels[0];
  if (!model) {
    throw badRequest(
      'Nenhum modelo de imagem configurado. Adicione um id de modelo (ex.: gpt-image-1) em Configurações.',
    );
  }
  const dir = projectDir(projectId);

  return jobQueue.start('image-generate', async (handle) => {
    handle.update(0.1, `Gerando referência via ${model}…`);
    // Paid call inside the per-project spend guard: serializes concurrent
    // generations and re-checks the cap (fail-closed) before billing.
    const { png } = await withSpendGuard(dir, spendCapUsd, async () => {
      const result = await generateImageViaGateway({ apiKey, model, prompt });
      await recordSpend(dir, result.spend);
      return result;
    });
    handle.update(0.85, 'Salvando candidato…');
    // Accumulate as a candidate; the user picks the keeper in the Estúdio.
    await addAssetVariant(projectId, assetId, {
      data: png,
      originalName: `${assetId}.png`,
      source: 'generated',
      generationPrompt: prompt,
      generationModel: model,
      autoSelect: false,
    });
    handle.update(1, 'Candidato gerado');
  });
}
