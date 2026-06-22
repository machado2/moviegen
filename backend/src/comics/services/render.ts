import type { Render } from '@moviegen/types';
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
  notes?: string;
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
  const ext = (input.originalName.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const filename = `${renderId}.${ext}`;
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
    notes: input.notes,
  };
  quadro.renders.push(render);
  if (!quadro.selectedRenderId) quadro.selectedRenderId = render.id;
  await savePrancha(projectId, prancha);
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
}
