import type {
  BookAssemblyStatus,
  BookFormat,
  JobProgress,
  MontagemOptions,
  Prancha,
  PranchaAssemblyStatus,
} from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject } from './project.js';
import { getPrancha, listPranchaRefs } from './prancha.js';
import { addRender } from './render.js';
import { buildQuadroPrompt, promptAttachmentIds } from './prompt.js';
import { generateFrame } from './ai.js';
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

export async function pranchaStatus(projectId: string, pranchaId: string): Promise<PranchaAssemblyStatus> {
  const prancha = await getPrancha(projectId, pranchaId);
  const { missing, newestInputMs } = await selectedRenderPaths(projectId, prancha);
  const quadrosWithRender = prancha.quadros.length - missing.length;
  const ready = prancha.quadros.length > 0 && missing.length === 0;
  const outStat = await fs.statFile(cfs.pranchaOutputFile(projectId, pranchaId));
  let state: PranchaAssemblyStatus['state'] = 'not-assembled';
  if (outStat) state = outStat.mtime.getTime() >= newestInputMs ? 'assembled' : 'stale';
  return {
    pranchaId,
    number: prancha.number,
    shortTitle: prancha.shortTitle,
    layout: prancha.layout,
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
  const { paths, missing } = await selectedRenderPaths(projectId, prancha);
  if (missing.length) {
    throw badRequest(
      `Cannot assemble: ${missing.length} quadro(s) have no selected render`,
      missing.map((o) => `quadro order ${o}`),
    );
  }
  const opts: MontagemOptions = { ...MONTAGEM_DEFAULTS, ...options };
  const output = cfs.pranchaOutputFile(projectId, pranchaId);
  return jobQueue.start('prancha-assembly', async (handle) => {
    handle.update(0.1, 'Composing page…');
    await montagePrancha({ ...opts, layout: prancha.layout, renders: paths, output });
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

export async function startRenderGeneration(
  projectId: string,
  pranchaId: string,
  quadroId: string,
): Promise<JobProgress> {
  const project = await getProject(projectId);
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');

  const prompt = buildQuadroPrompt(project, prancha, quadro);
  const attachmentPaths: string[] = [];
  for (const assetId of promptAttachmentIds(quadro)) {
    const asset = project.assets[assetId];
    if (asset?.file) attachmentPaths.push(cfs.resolveInProject(projectId, asset.file));
  }

  return jobQueue.start('render-generate', async (handle) => {
    handle.update(0.1, 'Generating frame via codex…');
    const { png } = await generateFrame(prompt, attachmentPaths);
    handle.update(0.85, 'Storing render…');
    await addRender(projectId, pranchaId, quadroId, {
      data: png,
      originalName: 'render.png',
      source: 'generated',
      generationPrompt: prompt,
    });
    handle.update(1, 'Render generated');
  });
}
