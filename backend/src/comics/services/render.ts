import type { PageRender, Render } from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getPrancha, savePrancha } from './prancha.js';
import { newId, nowIso } from '../../lib/ids.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { probeImage } from '../assembly/probe.js';

export async function listRenders(
  projectId: string,
  pranchaId: string,
  quadroId: string,
): Promise<Render[]> {
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');
  return quadro.renders;
}

export interface AddRenderInput {
  data: Buffer;
  originalName: string;
  source: 'generated' | 'upload';
  generationPrompt?: string;
  generationModel?: string;
  notes?: string;
  /** Select this render if the quadro has none yet. Upload → true; API generation → false. */
  autoSelect?: boolean;
}

export async function addRender(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  input: AddRenderInput,
): Promise<Render> {
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');

  const renderId = newId('render');
  const filename = cfs.renderFilename(renderId, input.originalName);
  const absPath = cfs.renderFile(projectId, pranchaId, quadroId, filename);
  await fs.writeBuffer(absPath, input.data);

  let widthPx: number | null = null;
  let heightPx: number | null = null;
  try {
    ({ widthPx, heightPx } = await probeImage(absPath));
  } catch {
    /* best-effort */
  }

  const render: Render = {
    id: renderId,
    quadroId,
    createdAt: nowIso(),
    filename,
    fileSizeBytes: input.data.byteLength,
    widthPx,
    heightPx,
    source: input.source,
    generationPrompt: input.generationPrompt,
    generationModel: input.generationModel,
    notes: input.notes,
  };
  quadro.renders.push(render);
  // Upload selects the first render; API generation never auto-selects.
  if (input.autoSelect !== false && !quadro.selectedRenderId) quadro.selectedRenderId = render.id;
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `render: prancha ${prancha.number} · quadro ${quadro.order}`);
  return render;
}

export async function getRenderAbsolutePath(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  renderId: string,
): Promise<{ path: string; render: Render }> {
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');
  const render = quadro.renders.find((r) => r.id === renderId);
  if (!render) throw notFound('Render');
  return { path: cfs.renderFile(projectId, pranchaId, quadroId, render.filename), render };
}

export async function deleteRender(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  renderId: string,
): Promise<void> {
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');
  const render = quadro.renders.find((r) => r.id === renderId);
  if (!render) throw notFound('Render');
  quadro.renders = quadro.renders.filter((r) => r.id !== renderId);
  if (quadro.selectedRenderId === renderId) {
    quadro.selectedRenderId = quadro.renders[0]?.id ?? null;
  }
  await savePrancha(projectId, prancha);
  await fs.remove(cfs.renderFile(projectId, pranchaId, quadroId, render.filename));
  await cfs.commitProject(projectId, `render removido: prancha ${prancha.number} · quadro ${quadro.order}`);
}

export async function selectRender(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  renderId: string | null,
): Promise<void> {
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');
  if (renderId !== null && !quadro.renders.some((r) => r.id === renderId)) {
    throw badRequest('No such render on this quadro');
  }
  quadro.selectedRenderId = renderId;
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `seleção de render: prancha ${prancha.number} · quadro ${quadro.order}`);
}

export async function listPageRenders(projectId: string, pranchaId: string): Promise<PageRender[]> {
  const prancha = await getPrancha(projectId, pranchaId);
  return prancha.pageRenders ?? [];
}

export interface AddPageRenderInput {
  data: Buffer;
  originalName: string;
  source: 'generated' | 'upload';
  generationPrompt?: string;
  generationModel?: string;
  notes?: string;
  autoSelect?: boolean;
}

export async function addPageRender(
  projectId: string,
  pranchaId: string,
  input: AddPageRenderInput,
): Promise<PageRender> {
  const prancha = await getPrancha(projectId, pranchaId);
  const renderId = newId('page');
  const filename = cfs.pageRenderFilename(renderId, input.originalName);
  const absPath = cfs.pranchaPageRenderFile(projectId, pranchaId, filename);
  await fs.writeBuffer(absPath, input.data);

  let widthPx: number | null = null;
  let heightPx: number | null = null;
  try {
    ({ widthPx, heightPx } = await probeImage(absPath));
  } catch {
    /* best-effort */
  }

  const render: PageRender = {
    id: renderId,
    createdAt: nowIso(),
    filename,
    fileSizeBytes: input.data.byteLength,
    widthPx,
    heightPx,
    source: input.source,
    generationPrompt: input.generationPrompt,
    generationModel: input.generationModel,
    notes: input.notes,
  };
  prancha.pageRenders ??= [];
  prancha.pageRenders.push(render);
  if (input.autoSelect !== false && !prancha.selectedPageRenderId) prancha.selectedPageRenderId = render.id;
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `render de página: prancha ${prancha.number}`);
  return render;
}

export async function getPageRenderAbsolutePath(
  projectId: string,
  pranchaId: string,
  renderId: string,
): Promise<{ path: string; render: PageRender }> {
  const prancha = await getPrancha(projectId, pranchaId);
  const render = (prancha.pageRenders ?? []).find((r) => r.id === renderId);
  if (!render) throw notFound('Page render');
  return { path: cfs.pranchaPageRenderFile(projectId, pranchaId, render.filename), render };
}

export async function deletePageRender(projectId: string, pranchaId: string, renderId: string): Promise<void> {
  const prancha = await getPrancha(projectId, pranchaId);
  const render = (prancha.pageRenders ?? []).find((r) => r.id === renderId);
  if (!render) throw notFound('Page render');
  prancha.pageRenders = (prancha.pageRenders ?? []).filter((r) => r.id !== renderId);
  if (prancha.selectedPageRenderId === renderId) {
    prancha.selectedPageRenderId = prancha.pageRenders[0]?.id ?? null;
  }
  await savePrancha(projectId, prancha);
  await fs.remove(cfs.pranchaPageRenderFile(projectId, pranchaId, render.filename));
  await cfs.commitProject(projectId, `render de página removido: prancha ${prancha.number}`);
}

export async function selectPageRender(projectId: string, pranchaId: string, renderId: string | null): Promise<void> {
  const prancha = await getPrancha(projectId, pranchaId);
  if (renderId !== null && !(prancha.pageRenders ?? []).some((r) => r.id === renderId)) {
    throw badRequest('No such page render on this prancha');
  }
  prancha.selectedPageRenderId = renderId;
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `seleção de render de página: prancha ${prancha.number}`);
}
