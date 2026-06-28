import type {
  BookAssemblyStatus,
  BookFormat,
  JobProgress,
  MontagemOptions,
  Prancha,
  PageRender,
  PranchaAssemblyStatus,
} from '@mediagen/types';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject } from './project.js';
import { addAssetVariant, getAsset } from './asset.js';
import { getPrancha, listPranchaRefs } from './prancha.js';
import { addPageRender, addRender } from './render.js';
import { comicsCharacterPrompt, pranchaAttachmentIds, pranchaPagePrompt, quadroAttachmentIds, quadroPrompt } from '@mediagen/core';
import { generateFrame } from './ai.js';
import { generateImageViaGateway } from '../../services/imagegen.js';
import { getAiConfig } from '../../services/settings.js';
import { recordSpend, withSpendGuard } from '../../services/spend.js';
import { montagePrancha } from '../assembly/montagem.js';
import { buildCbz, buildPdfEpub } from '../assembly/book.js';
import { jobQueue } from '../../jobs/queue.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { MONTAGEM_DEFAULTS } from '../../config.js';

async function selectedRenderPaths(
  projectId: string,
  prancha: Prancha,
): Promise<{ paths: string[]; missing: number[]; newestInputMs: number }> {
  const ordered = [...prancha.quadros].sort((a, b) => a.order - b.order);
  const paths: string[] = [];
  const missing: number[] = [];
  let newestInputMs = 0;
  const pStat = await fs.statFile(cfs.pranchaFile(projectId, prancha.id));
  if (pStat) newestInputMs = Math.max(newestInputMs, pStat.mtime.getTime());

  for (const quadro of ordered) {
    const render = quadro.selectedRenderId
      ? quadro.renders.find((r) => r.id === quadro.selectedRenderId)
      : undefined;
    if (!render) {
      missing.push(quadro.order);
      continue;
    }
    const p = cfs.renderFile(projectId, prancha.id, quadro.id, render.filename);
    paths.push(p);
    const st = await fs.statFile(p);
    if (st) newestInputMs = Math.max(newestInputMs, st.mtime.getTime());
  }
  return { paths, missing, newestInputMs };
}

async function selectedPageRenderPath(
  projectId: string,
  prancha: Prancha,
): Promise<{ path: string | null; render: PageRender | null; newestInputMs: number }> {
  let newestInputMs = 0;
  const pStat = await fs.statFile(cfs.pranchaFile(projectId, prancha.id));
  if (pStat) newestInputMs = Math.max(newestInputMs, pStat.mtime.getTime());
  const render = prancha.selectedPageRenderId
    ? (prancha.pageRenders ?? []).find((r) => r.id === prancha.selectedPageRenderId) ?? null
    : null;
  if (!render) return { path: null, render: null, newestInputMs };
  const p = cfs.pranchaPageRenderFile(projectId, prancha.id, render.filename);
  const st = await fs.statFile(p);
  if (st) newestInputMs = Math.max(newestInputMs, st.mtime.getTime());
  return { path: p, render, newestInputMs };
}

export async function pranchaStatus(projectId: string, pranchaId: string): Promise<PranchaAssemblyStatus> {
  const prancha = await getPrancha(projectId, pranchaId);
  const renderMode = prancha.renderMode ?? 'panels';
  const panelState = renderMode === 'panels' ? await selectedRenderPaths(projectId, prancha) : null;
  const pageState = renderMode === 'page' ? await selectedPageRenderPath(projectId, prancha) : null;
  const missing = panelState?.missing ?? (pageState?.render ? [] : [0]);
  const newestInputMs = panelState?.newestInputMs ?? pageState?.newestInputMs ?? 0;
  const quadrosWithRender = renderMode === 'panels' ? prancha.quadros.length - missing.length : pageState?.render ? 1 : 0;
  const ready = renderMode === 'panels' ? prancha.quadros.length > 0 && missing.length === 0 : Boolean(pageState?.render);
  const outStat = await fs.statFile(cfs.pranchaOutputFile(projectId, pranchaId));
  let state: PranchaAssemblyStatus['state'] = 'not-assembled';
  if (outStat) state = outStat.mtime.getTime() >= newestInputMs ? 'assembled' : 'stale';
  return {
    pranchaId,
    number: prancha.number,
    shortTitle: prancha.shortTitle,
    layout: prancha.layout,
    renderMode,
    quadroCount: prancha.quadros.length,
    quadrosWithRender,
    ready,
    missingQuadros: missing,
    state,
    outputAt: outStat ? outStat.mtime.toISOString() : null,
  };
}

export async function getBookStatus(projectId: string): Promise<BookAssemblyStatus> {
  const refs = await listPranchaRefs(projectId);
  const pranchas: PranchaAssemblyStatus[] = [];
  for (const ref of refs) pranchas.push(await pranchaStatus(projectId, ref.id));
  const ready = pranchas.length > 0 && pranchas.every((p) => p.state === 'assembled');
  const fmt = async (f: BookFormat) => {
    const st = await fs.statFile(cfs.bookOutputFile(projectId, f));
    return st ? st.mtime.toISOString() : null;
  };
  return {
    pranchas,
    ready,
    outputs: { cbz: await fmt('cbz'), pdf: await fmt('pdf'), epub: await fmt('epub') },
  };
}

export async function startPranchaAssembly(
  projectId: string,
  pranchaId: string,
  options: Partial<MontagemOptions> = {},
): Promise<JobProgress> {
  const prancha = await getPrancha(projectId, pranchaId);
  if (prancha.quadros.length === 0) throw badRequest('Prancha has no quadros');
  const renderMode = prancha.renderMode ?? 'panels';
  const opts: MontagemOptions = { ...MONTAGEM_DEFAULTS, ...options };
  const output = cfs.pranchaOutputFile(projectId, pranchaId);
  return jobQueue.start('prancha-assembly', async (handle) => {
    handle.update(0.1, 'Composing page…');
    if (renderMode === 'page') {
      const { path: pagePath } = await selectedPageRenderPath(projectId, prancha);
      if (!pagePath) throw badRequest('Cannot assemble: prancha has no selected page render');
      await fs.ensureDir(path.dirname(output));
      await fsp.copyFile(pagePath, output);
    } else {
      const { paths, missing } = await selectedRenderPaths(projectId, prancha);
      if (missing.length) {
        throw badRequest(
          `Cannot assemble: ${missing.length} quadro(s) have no selected render`,
          missing.map((o) => `quadro order ${o}`),
        );
      }
      const lettering = prancha.quadros
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((q) => ({ order: q.order, texts: q.texts ?? [] }));
      await montagePrancha({ ...opts, layout: prancha.layout, renders: paths, output, lettering });
    }
    await cfs.commitProject(projectId, `montagem: prancha ${prancha.number} · ${prancha.shortTitle}`);
    handle.update(1, 'Page assembled');
  });
}

export async function startBookAssembly(
  projectId: string,
  formats: BookFormat[],
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const refs = await listPranchaRefs(projectId);
  if (refs.length === 0) throw badRequest('Project has no pranchas');

  const pages: { number: number; imagePath: string }[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const p = cfs.pranchaOutputFile(projectId, ref.id);
    if (await fs.pathExists(p)) pages.push({ number: ref.number, imagePath: p });
    else missing.push(`prancha ${ref.number} (${ref.shortTitle})`);
  }
  if (missing.length) {
    throw badRequest(`Cannot assemble book: ${missing.length} prancha(s) not assembled`, missing);
  }
  pages.sort((a, b) => a.number - b.number);
  const wanted = formats.length ? formats : (['cbz', 'pdf', 'epub'] as BookFormat[]);

  return jobQueue.start('book-assembly', async (handle) => {
    let step = 0;
    const total = wanted.length;
    if (wanted.includes('cbz')) {
      handle.update(step / total, 'Building CBZ…');
      await buildCbz(pages, cfs.bookOutputFile(projectId, 'cbz'));
      step++;
    }
    if (wanted.includes('pdf') || wanted.includes('epub')) {
      handle.update(step / total, 'Building PDF/EPUB…');
      await buildPdfEpub(
        pages.map((p) => p.imagePath),
        {
          title: project.title,
          language: project.language,
          outputPdf: wanted.includes('pdf') ? cfs.bookOutputFile(projectId, 'pdf') : undefined,
          outputEpub: wanted.includes('epub') ? cfs.bookOutputFile(projectId, 'epub') : undefined,
        },
      );
    }
    await cfs.commitProject(projectId, `publicação: ${wanted.join(', ')}`);
    handle.update(1, 'Book assembled');
  });
}

export interface RenderGenerationOptions {
  /** Image model id to route through the gateway. Defaults to the first configured one. */
  model?: string;
  /** Opt in to the local codex CLI instead of the gateway (manual/offline only). */
  useCodex?: boolean;
}

export async function startRenderGeneration(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  opts: RenderGenerationOptions = {},
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');

  const prompt = quadroPrompt(project, prancha, quadro);
  const attachmentPaths: string[] = [];
  for (const assetId of quadroAttachmentIds(quadro)) {
    const asset = project.assets[assetId];
    if (asset?.file) attachmentPaths.push(cfs.resolveInProject(projectId, asset.file));
  }

  const dir = cfs.projectDir(projectId);

  // Local codex CLI: explicit, manual/offline opt-in only — never the default.
  if (opts.useCodex) {
    return jobQueue.start('render-generate', async (handle) => {
      handle.update(0.1, 'Gerando quadro via codex (local)…');
      const { png } = await generateFrame(prompt, attachmentPaths);
      handle.update(0.85, 'Salvando candidato…');
      await addRender(projectId, pranchaId, quadroId, {
        data: png,
        originalName: 'render.png',
        source: 'generated',
        generationPrompt: prompt,
        generationModel: 'codex',
        autoSelect: false,
      });
      handle.update(1, 'Render gerado');
    });
  }

  // Default: the LiteLLM gateway with a configured image model.
  const { apiKey, spendCapUsd, imageModels } = await getAiConfig();
  const model = opts.model || imageModels[0];
  if (!model) {
    throw badRequest(
      'Nenhum modelo de imagem configurado. Adicione um id de modelo (ex.: gpt-image-1) em Configurações ou use a opção manual via codex.',
    );
  }
  return jobQueue.start('render-generate', async (handle) => {
    handle.update(0.1, `Gerando quadro via ${model}…`);
    // Paid call inside the per-project spend guard: serializes concurrent
    // generations and re-checks the cap (fail-closed) before billing.
    const { png } = await withSpendGuard(dir, spendCapUsd, async () => {
      const result = await generateImageViaGateway({ apiKey, model, prompt, attachmentPaths });
      await recordSpend(dir, result.spend);
      return result;
    });
    handle.update(0.85, 'Salvando candidato…');
    await addRender(projectId, pranchaId, quadroId, {
      data: png,
      originalName: 'render.png',
      source: 'generated',
      generationPrompt: prompt,
      generationModel: model,
      autoSelect: false,
    });
    handle.update(1, 'Render gerado');
  });
}

export async function startPageRenderGeneration(
  projectId: string,
  pranchaId: string,
  opts: RenderGenerationOptions = {},
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const prancha = await getPrancha(projectId, pranchaId);
  const prompt = pranchaPagePrompt(project, prancha);
  const attachmentPaths: string[] = [];
  for (const assetId of pranchaAttachmentIds(prancha)) {
    const asset = project.assets[assetId];
    if (asset?.file) attachmentPaths.push(cfs.resolveInProject(projectId, asset.file));
  }

  const dir = cfs.projectDir(projectId);
  if (opts.useCodex) {
    return jobQueue.start('render-generate', async (handle) => {
      handle.update(0.1, 'Gerando prancha inteira via codex (local)…');
      const { png } = await generateFrame(prompt, attachmentPaths);
      handle.update(0.85, 'Salvando candidato…');
      await addPageRender(projectId, pranchaId, {
        data: png,
        originalName: 'page.png',
        source: 'generated',
        generationPrompt: prompt,
        generationModel: 'codex',
        autoSelect: false,
      });
      handle.update(1, 'Prancha gerada');
    });
  }

  const { apiKey, spendCapUsd, imageModels } = await getAiConfig();
  const model = opts.model || imageModels[0];
  if (!model) {
    throw badRequest('Nenhum modelo de imagem configurado. Adicione um id de modelo em Configurações.');
  }
  return jobQueue.start('render-generate', async (handle) => {
    handle.update(0.1, `Gerando prancha inteira via ${model}…`);
    const { png } = await withSpendGuard(dir, spendCapUsd, async () => {
      const result = await generateImageViaGateway({ apiKey, model, prompt, attachmentPaths });
      await recordSpend(dir, result.spend);
      return result;
    });
    handle.update(0.85, 'Salvando candidato…');
    await addPageRender(projectId, pranchaId, {
      data: png,
      originalName: 'page.png',
      source: 'generated',
      generationPrompt: prompt,
      generationModel: model,
      autoSelect: false,
    });
    handle.update(1, 'Prancha gerada');
  });
}

export interface CharacterImageGenerationOptions {
  /** Image model id to route through the gateway. Defaults to the first configured one. */
  model?: string;
  /** The copy-paste-ready prompt built by the Estúdio; falls back to a template. */
  prompt?: string;
}

/** Generate a character reference image via the gateway, saved as the asset file. */
export async function startCharacterImageGeneration(
  projectId: string,
  assetId: string,
  opts: CharacterImageGenerationOptions = {},
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const asset = await getAsset(projectId, assetId);

  const prompt = opts.prompt?.trim() || comicsCharacterPrompt(project, asset);

  const { apiKey, spendCapUsd, imageModels } = await getAiConfig();
  const model = opts.model || imageModels[0];
  if (!model) {
    throw badRequest(
      'Nenhum modelo de imagem configurado. Adicione um id de modelo (ex.: gpt-image-1) em Configurações.',
    );
  }
  const dir = cfs.projectDir(projectId);

  return jobQueue.start('image-generate', async (handle) => {
    handle.update(0.1, `Gerando personagem via ${model}…`);
    // Paid call inside the per-project spend guard: serializes concurrent
    // generations and re-checks the cap (fail-closed) before billing.
    const { png } = await withSpendGuard(dir, spendCapUsd, async () => {
      const result = await generateImageViaGateway({ apiKey, model, prompt });
      await recordSpend(dir, result.spend);
      return result;
    });
    handle.update(0.85, 'Salvando candidato…');
    await addAssetVariant(projectId, assetId, {
      data: png,
      originalName: `${assetId}.png`,
      source: 'generated',
      generationPrompt: prompt,
      generationModel: model,
      autoSelect: false,
    });
    handle.update(1, 'Personagem gerado');
  });
}
