import type {
  AssetVariant,
  ComicsAsset,
  ComicsAssetRole,
  ComicsAssetStatus,
} from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import {
  listVariantFiles,
  migrateVariants,
  recordVariant,
  removeVariant,
  selectVariant,
} from '../../storage/variants.js';
import { getProject, saveProject } from './project.js';
import { newId, nowIso } from '../../lib/ids.js';
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
  for (const rel of listVariantFiles(asset)) await fs.remove(cfs.resolveInProject(projectId, rel));
  await cfs.commitProject(projectId, `asset removido: ${assetId}`);
}

export interface AddAssetVariantInput {
  data: Buffer;
  originalName: string;
  source: 'upload' | 'generated';
  generationPrompt?: string;
  generationModel?: string;
  /** Make this the selected result. Upload → true; API generation → false (the user picks). */
  autoSelect?: boolean;
}

export async function addAssetVariant(
  projectId: string,
  assetId: string,
  input: AddAssetVariantInput,
): Promise<{ asset: ComicsAsset; variant: AssetVariant }> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  const variantId = newId('var');
  const rel = cfs.assetRelPath(assetId, variantId, input.originalName);
  await fs.writeBuffer(cfs.resolveInProject(projectId, rel), input.data);
  const variant: AssetVariant = {
    id: variantId,
    file: rel,
    createdAt: nowIso(),
    source: input.source,
    generationPrompt: input.generationPrompt,
    generationModel: input.generationModel,
  };
  recordVariant(asset, variant, input.autoSelect ?? false);
  await saveProject(project);
  await cfs.commitProject(projectId, `variante: ${assetId}`);
  return { asset, variant };
}

export async function uploadAssetFile(
  projectId: string,
  assetId: string,
  data: Buffer,
  originalName: string,
): Promise<ComicsAsset> {
  const { asset } = await addAssetVariant(projectId, assetId, {
    data,
    originalName,
    source: 'upload',
    autoSelect: true,
  });
  return asset;
}

export async function listAssetVariants(projectId: string, assetId: string): Promise<AssetVariant[]> {
  const asset = await getAsset(projectId, assetId);
  migrateVariants(asset);
  return asset.variants ?? [];
}

export async function selectAssetVariant(
  projectId: string,
  assetId: string,
  variantId: string | null,
): Promise<ComicsAsset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  selectVariant(asset, variantId);
  await saveProject(project);
  await cfs.commitProject(projectId, `seleção de variante: ${assetId}`);
  return asset;
}

export async function deleteAssetVariant(
  projectId: string,
  assetId: string,
  variantId: string,
): Promise<ComicsAsset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  const variant = removeVariant(asset, variantId);
  await saveProject(project);
  await fs.remove(cfs.resolveInProject(projectId, variant.file));
  await cfs.commitProject(projectId, `variante removida: ${assetId}`);
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

export async function getAssetVariantAbsolutePath(
  projectId: string,
  assetId: string,
  variantId: string,
): Promise<{ path: string; variant: AssetVariant }> {
  const asset = await getAsset(projectId, assetId);
  migrateVariants(asset);
  const variant = asset.variants?.find((v) => v.id === variantId);
  if (!variant) throw notFound('Variant');
  return { path: cfs.resolveInProject(projectId, variant.file), variant };
}

// Character derivation lives in ./character.ts (the character read-model module).
