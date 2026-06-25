import type {
  ComicsAsset,
  ComicsAssetRole,
  ComicsAssetStatus,
  ComicsCharacter,
  ComicsProject,
} from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, slugify } from '../../lib/ids.js';
import { badRequest, notFound } from '../../lib/errors.js';

export async function listAssets(projectId: string): Promise<ComicsAsset[]> {
  return Object.values((await getProject(projectId)).assets);
}

export async function getAsset(projectId: string, assetId: string): Promise<ComicsAsset> {
  const asset = (await getProject(projectId)).assets[assetId];
  if (!asset) throw notFound('Asset');
  return asset;
}

export interface CreateAssetInput {
  id?: string;
  role: ComicsAssetRole;
  status?: ComicsAssetStatus;
  characterName?: string;
  characterDescription?: string;
  description?: string;
}

export async function createAsset(projectId: string, input: CreateAssetInput): Promise<ComicsAsset> {
  const project = await getProject(projectId);
  const id = input.id ?? newId(input.role);
  if (project.assets[id]) throw badRequest(`Asset id already exists: ${id}`);
  const asset: ComicsAsset = {
    id,
    type: 'image',
    role: input.role,
    status: input.status ?? 'pending',
    file: null,
    characterName: input.characterName,
    characterDescription: input.characterDescription,
    description: input.description,
  };
  project.assets[id] = asset;
  await saveProject(project);
  await cfs.commitProject(projectId, `asset criado: ${id}`);
  return asset;
}

export type UpdateAssetInput = Partial<Omit<ComicsAsset, 'id' | 'type'>>;

export async function updateAsset(
  projectId: string,
  assetId: string,
  patch: UpdateAssetInput,
): Promise<ComicsAsset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  Object.assign(asset, patch);
  await saveProject(project);
  await cfs.commitProject(projectId, `edição: asset ${assetId}`);
  return asset;
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  delete project.assets[assetId];
  await saveProject(project);
  if (asset.file) await fs.remove(cfs.resolveInProject(projectId, asset.file));
  await cfs.commitProject(projectId, `asset removido: ${assetId}`);
}

export async function uploadAssetFile(
  projectId: string,
  assetId: string,
  data: Buffer,
  originalName: string,
): Promise<ComicsAsset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  const ext = (originalName.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const rel = `assets/${assetId}.${ext}`;
  await fs.writeBuffer(cfs.resolveInProject(projectId, rel), data);
  if (asset.file && asset.file !== rel) await fs.remove(cfs.resolveInProject(projectId, asset.file));
  asset.file = rel;
  if (asset.status === 'pending') asset.status = 'active';
  await saveProject(project);
  await cfs.commitProject(projectId, `asset: ${assetId}`);
  return asset;
}

export async function getAssetFileAbsolutePath(
  projectId: string,
  assetId: string,
): Promise<{ path: string; asset: ComicsAsset }> {
  const asset = await getAsset(projectId, assetId);
  if (!asset.file) throw notFound('Asset file');
  return { path: cfs.resolveInProject(projectId, asset.file), asset };
}

// ─── Character derivation ─────────────────────────────────────────────────────

export function deriveCharacters(project: ComicsProject): ComicsCharacter[] {
  const out: ComicsCharacter[] = [];
  const seen = new Set<string>();
  for (const asset of Object.values(project.assets)) {
    if (asset.role !== 'character' || !asset.characterName) continue;
    const id = slugify(asset.characterName);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: asset.characterName,
      description: asset.characterDescription ?? asset.description ?? '',
      assetId: asset.id,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function listCharacters(projectId: string): Promise<ComicsCharacter[]> {
  return deriveCharacters(await getProject(projectId));
}

export async function getCharacter(projectId: string, charId: string): Promise<ComicsCharacter> {
  const c = (await listCharacters(projectId)).find((x) => x.id === charId);
  if (!c) throw notFound('Character');
  return c;
}
