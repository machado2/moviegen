import type { Prancha, PranchaLayout, PranchaRef, PranchaRenderMode, Quadro } from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, slugify } from '../../lib/ids.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { quadroCount, slotFormatFor } from '../layout.js';

/** Sort quadros by order, renumber 1..n, and re-derive each slotFormat by position. */
function resyncSlots(prancha: Prancha): void {
  prancha.quadros.sort((a, b) => a.order - b.order);
  prancha.quadros.forEach((q, i) => {
    q.order = i + 1;
    q.slotFormat = slotFormatFor(prancha.layout, i);
  });
}

function emptyQuadro(layout: PranchaLayout, index: number): Quadro {
  return {
    id: newId('quadro'),
    order: index + 1,
    slotFormat: slotFormatFor(layout, index),
    composition: '',
    characters: [],
    setting: '',
    texts: [],
    restrictions: [],
    refs: [],
    selectedRenderId: null,
    renders: [],
  };
}

export async function listPranchaRefs(projectId: string): Promise<PranchaRef[]> {
  const project = await getProject(projectId);
  return [...project.pranchas].sort((a, b) => a.number - b.number);
}

export async function getPrancha(projectId: string, pranchaId: string): Promise<Prancha> {
  const file = cfs.pranchaFile(projectId, pranchaId);
  if (!(await fs.pathExists(file))) throw notFound('Prancha');
  return fs.readNickel<Prancha>(file);
}

export async function savePrancha(projectId: string, prancha: Prancha): Promise<Prancha> {
  await fs.writeNickel(cfs.pranchaFile(projectId, prancha.id), prancha);
  const project = await getProject(projectId);
  const ref: PranchaRef = {
    id: prancha.id,
    number: prancha.number,
    shortTitle: prancha.shortTitle,
    file: `pranchas/${prancha.id}.ncl`,
  };
  const idx = project.pranchas.findIndex((p) => p.id === prancha.id);
  if (idx === -1) project.pranchas.push(ref);
  else project.pranchas[idx] = ref;
  project.pranchas.sort((a, b) => a.number - b.number);
  await saveProject(project);
  return prancha;
}

export interface CreatePranchaInput {
  number?: number;
  shortTitle: string;
  origin?: string;
  layout: PranchaLayout;
  renderMode?: PranchaRenderMode;
  autoQuadros?: boolean; // default true: pre-create the layout's quadros
}

export async function createPrancha(projectId: string, input: CreatePranchaInput): Promise<Prancha> {
  const project = await getProject(projectId);
  const number = input.number ?? (project.pranchas.reduce((m, p) => Math.max(m, p.number), 0) + 1);
  const id = `prancha-${number}-${slugify(input.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
  const count = input.autoQuadros === false ? 0 : quadroCount(input.layout);
  const prancha: Prancha = {
    id,
    number,
    shortTitle: input.shortTitle,
    origin: input.origin ?? '',
    layout: input.layout,
    renderMode: input.renderMode ?? 'panels',
    selectedPageRenderId: null,
    pageRenders: [],
    quadros: Array.from({ length: count }, (_, i) => emptyQuadro(input.layout, i)),
  };
  const saved = await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `prancha criada: ${number} · ${prancha.shortTitle}`);
  return saved;
}

export interface UpdatePranchaInput {
  number?: number;
  shortTitle?: string;
  origin?: string;
  layout?: PranchaLayout;
  renderMode?: PranchaRenderMode;
}

export async function updatePrancha(
  projectId: string,
  pranchaId: string,
  patch: UpdatePranchaInput,
): Promise<Prancha> {
  const prancha = await getPrancha(projectId, pranchaId);
  if (patch.number !== undefined) prancha.number = patch.number;
  if (patch.shortTitle !== undefined) prancha.shortTitle = patch.shortTitle;
  if (patch.origin !== undefined) prancha.origin = patch.origin;
  if (patch.renderMode !== undefined) prancha.renderMode = patch.renderMode;
  if (patch.layout !== undefined) {
    prancha.layout = patch.layout;
    // Re-derive slot formats; renders are preserved (additive, never destroyed).
    resyncSlots(prancha);
  }
  const saved = await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `edição: prancha ${prancha.number}`);
  return saved;
}

export async function deletePrancha(projectId: string, pranchaId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project.pranchas.some((p) => p.id === pranchaId)) throw notFound('Prancha');
  project.pranchas = project.pranchas.filter((p) => p.id !== pranchaId);
  await saveProject(project);
  await fs.remove(cfs.pranchaFile(projectId, pranchaId));
  await fs.remove(cfs.pranchaRendersDir(projectId, pranchaId));
  await fs.remove(cfs.pranchaOutputFile(projectId, pranchaId));
  await cfs.commitProject(projectId, 'prancha removida');
}

export async function reorderPranchas(projectId: string, orderedIds: string[]): Promise<PranchaRef[]> {
  const project = await getProject(projectId);
  const known = new Set(project.pranchas.map((p) => p.id));
  if (orderedIds.length !== project.pranchas.length || orderedIds.some((id) => !known.has(id))) {
    throw badRequest('Reorder list must contain exactly the existing prancha ids');
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const prancha = await getPrancha(projectId, orderedIds[i]!);
    prancha.number = i + 1;
    await fs.writeNickel(cfs.pranchaFile(projectId, prancha.id), prancha);
  }
  const refreshed = await getProject(projectId);
  refreshed.pranchas = orderedIds.map((id, i) => {
    const ref = refreshed.pranchas.find((p) => p.id === id)!;
    return { ...ref, number: i + 1 };
  });
  await saveProject(refreshed);
  await cfs.commitProject(projectId, 'pranchas reordenadas');
  return refreshed.pranchas;
}

// ─── Quadros ──────────────────────────────────────────────────────────────────

export interface CreateQuadroInput {
  composition?: string;
  characters?: string[];
  setting?: string;
  texts?: Quadro['texts'];
  restrictions?: string[];
  refs?: string[];
}

export async function addQuadro(
  projectId: string,
  pranchaId: string,
  input: CreateQuadroInput,
): Promise<Quadro> {
  const prancha = await getPrancha(projectId, pranchaId);
  const index = prancha.quadros.length;
  const quadro: Quadro = {
    ...emptyQuadro(prancha.layout, index),
    composition: input.composition ?? '',
    characters: input.characters ?? [],
    setting: input.setting ?? '',
    texts: input.texts ?? [],
    restrictions: input.restrictions ?? [],
    refs: input.refs ?? [],
  };
  prancha.quadros.push(quadro);
  resyncSlots(prancha);
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `quadro: prancha ${prancha.number} · quadro ${quadro.order}`);
  return prancha.quadros.find((q) => q.id === quadro.id)!;
}

// slotFormat and renders are managed automatically and cannot be patched directly.
export type UpdateQuadroInput = Partial<
  Pick<Quadro, 'composition' | 'characters' | 'setting' | 'texts' | 'restrictions' | 'refs' | 'skipped' | 'queuePriority'>
>;

export async function updateQuadro(
  projectId: string,
  pranchaId: string,
  quadroId: string,
  patch: UpdateQuadroInput,
): Promise<Quadro> {
  const prancha = await getPrancha(projectId, pranchaId);
  const quadro = prancha.quadros.find((q) => q.id === quadroId);
  if (!quadro) throw notFound('Quadro');
  if (patch.composition !== undefined) quadro.composition = patch.composition;
  if (patch.characters !== undefined) quadro.characters = patch.characters;
  if (patch.setting !== undefined) quadro.setting = patch.setting;
  if (patch.texts !== undefined) quadro.texts = patch.texts;
  if (patch.restrictions !== undefined) quadro.restrictions = patch.restrictions;
  if (patch.refs !== undefined) quadro.refs = patch.refs;
  if (patch.skipped !== undefined) quadro.skipped = patch.skipped;
  if (patch.queuePriority !== undefined) quadro.queuePriority = patch.queuePriority;
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `edição: prancha ${prancha.number} · quadro ${quadro.order}`);
  return quadro;
}

export async function deleteQuadro(projectId: string, pranchaId: string, quadroId: string): Promise<void> {
  const prancha = await getPrancha(projectId, pranchaId);
  if (!prancha.quadros.some((q) => q.id === quadroId)) throw notFound('Quadro');
  prancha.quadros = prancha.quadros.filter((q) => q.id !== quadroId);
  resyncSlots(prancha);
  await savePrancha(projectId, prancha);
  await fs.remove(cfs.rendersDir(projectId, pranchaId, quadroId));
  await cfs.commitProject(projectId, `quadro removido: prancha ${prancha.number}`);
}

export async function reorderQuadros(
  projectId: string,
  pranchaId: string,
  orderedIds: string[],
): Promise<Quadro[]> {
  const prancha = await getPrancha(projectId, pranchaId);
  const known = new Set(prancha.quadros.map((q) => q.id));
  if (orderedIds.length !== prancha.quadros.length || orderedIds.some((id) => !known.has(id))) {
    throw badRequest('Reorder list must contain exactly the existing quadro ids');
  }
  const byId = new Map(prancha.quadros.map((q) => [q.id, q]));
  prancha.quadros = orderedIds.map((id) => byId.get(id)!);
  resyncSlots(prancha);
  await savePrancha(projectId, prancha);
  await cfs.commitProject(projectId, `quadros reordenados: prancha ${prancha.number}`);
  return prancha.quadros;
}
