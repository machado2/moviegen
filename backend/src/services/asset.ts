import type { Asset, AssetRole, AssetStatus, AssetType, AssetVariant, Character, Project } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, nowIso, slugify } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';

// `asset.file` is the single source of truth that the rest of the app reads, so
// it always mirrors the selected variant. Legacy assets (a bare `file`, no
// variants) are migrated lazily into a one-variant list on first touch.
// Stable id for the variant synthesized from a legacy single `file`, so the id
// a client sees on a read path (list) still resolves on a later select/serve
// even before the migration is persisted by the next write.
const LEGACY_VARIANT_ID = 'var_legacy';

function migrateVariants(asset: Asset): boolean {
  if (!asset.variants) asset.variants = [];
  if (asset.variants.length === 0 && asset.file) {
    const v: AssetVariant = { id: LEGACY_VARIANT_ID, file: asset.file, createdAt: nowIso(), source: 'upload' };
    asset.variants.push(v);
    asset.selectedVariantId = v.id;
    return true;
  }
  return false;
}

function syncSelectedFile(asset: Asset): void {
  const v = asset.variants?.find((x) => x.id === asset.selectedVariantId);
  asset.file = v ? v.file : null;
}

export async function listAssets(projectId: string): Promise<Asset[]> {
  const project = await getProject(projectId);
  return Object.values(project.assets);
}

export async function getAsset(projectId: string, assetId: string): Promise<Asset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  return asset;
}

export interface CreateAssetInput {
  id?: string;
  type: AssetType;
  role: AssetRole;
  status?: AssetStatus;
  prompt?: string;
  characterName?: string;
  description?: string;
  sourceId?: string;
  crop?: string;
}

export async function createAsset(projectId: string, input: CreateAssetInput): Promise<Asset> {
  const project = await getProject(projectId);
  const id = input.id ?? newId(input.role.split('-')[0]);
  if (project.assets[id]) throw badRequest(`Asset id already exists: ${id}`);
  const asset: Asset = {
    id,
    type: input.type,
    role: input.role,
    status: input.status ?? 'pending',
    file: null,
    prompt: input.prompt ?? '',
    characterName: input.characterName,
    description: input.description,
    sourceId: input.sourceId,
    crop: input.crop,
  };
  project.assets[id] = asset;
  await saveProject(project);
  await fs.commitProject(projectId, `asset criado: ${id}`);
  return asset;
}

export type UpdateAssetInput = Partial<Omit<Asset, 'id'>>;

export async function updateAsset(
  projectId: string,
  assetId: string,
  patch: UpdateAssetInput,
): Promise<Asset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  Object.assign(asset, patch);
  await saveProject(project);
  await fs.commitProject(projectId, `edição: asset ${assetId}`);
  return asset;
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  delete project.assets[assetId];
  await saveProject(project);
  // Remove every produced file (all variants + the legacy single file).
  const files = new Set<string>(asset.variants?.map((v) => v.file) ?? []);
  if (asset.file) files.add(asset.file);
  for (const rel of files) await fs.remove(fs.resolveInProject(projectId, rel));
  await fs.commitProject(projectId, `asset removido: ${assetId}`);
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
): Promise<{ asset: Asset; variant: AssetVariant }> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  migrateVariants(asset);
  const variantId = newId('var');
  const ext = (input.originalName.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const rel = `assets/${assetId}-${variantId}.${ext}`;
  await fs.writeBuffer(fs.resolveInProject(projectId, rel), input.data);
  const variant: AssetVariant = {
    id: variantId,
    file: rel,
    createdAt: nowIso(),
    source: input.source,
    generationPrompt: input.generationPrompt,
    generationModel: input.generationModel,
  };
  asset.variants!.push(variant);
  if (input.autoSelect) {
    asset.selectedVariantId = variantId;
    if (asset.status === 'pending') asset.status = 'active';
  }
  syncSelectedFile(asset);
  await saveProject(project);
  await fs.commitProject(projectId, `variante: ${assetId}`);
  return { asset, variant };
}

/** Upload keeps the old contract: add a variant and make it the selected result. */
export async function uploadAssetFile(
  projectId: string,
  assetId: string,
  data: Buffer,
  originalName: string,
): Promise<Asset> {
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
  migrateVariants(asset); // in-memory only; no write on a read path
  return asset.variants ?? [];
}

export async function selectAssetVariant(
  projectId: string,
  assetId: string,
  variantId: string | null,
): Promise<Asset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  migrateVariants(asset);
  if (variantId !== null && !asset.variants!.some((v) => v.id === variantId)) {
    throw badRequest('No such variant on this asset');
  }
  asset.selectedVariantId = variantId;
  if (variantId && asset.status === 'pending') asset.status = 'active';
  syncSelectedFile(asset);
  await saveProject(project);
  await fs.commitProject(projectId, `seleção de variante: ${assetId}`);
  return asset;
}

export async function deleteAssetVariant(
  projectId: string,
  assetId: string,
  variantId: string,
): Promise<Asset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  migrateVariants(asset);
  const variant = asset.variants!.find((v) => v.id === variantId);
  if (!variant) throw notFound('Variant');
  asset.variants = asset.variants!.filter((v) => v.id !== variantId);
  if (asset.selectedVariantId === variantId) asset.selectedVariantId = null;
  syncSelectedFile(asset);
  await saveProject(project);
  await fs.remove(fs.resolveInProject(projectId, variant.file));
  await fs.commitProject(projectId, `variante removida: ${assetId}`);
  return asset;
}

export async function getAssetFileAbsolutePath(
  projectId: string,
  assetId: string,
): Promise<{ path: string; asset: Asset }> {
  const asset = await getAsset(projectId, assetId);
  if (!asset.file) throw notFound('Asset file');
  return { path: fs.resolveInProject(projectId, asset.file), asset };
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
  return { path: fs.resolveInProject(projectId, variant.file), variant };
}

// ─── Character derivation ─────────────────────────────────────────────────────

const CHARACTER_ROLES: AssetRole[] = ['character-face', 'character-body', 'character-concept', 'voice'];

export function deriveCharacters(project: Project): Character[] {
  const byChar = new Map<string, { name: string; assets: Asset[] }>();
  for (const asset of Object.values(project.assets)) {
    if (!asset.characterName) continue;
    if (!CHARACTER_ROLES.includes(asset.role)) continue;
    const id = slugify(asset.characterName);
    if (!byChar.has(id)) byChar.set(id, { name: asset.characterName, assets: [] });
    byChar.get(id)!.assets.push(asset);
  }

  const find = (assets: Asset[], role: AssetRole): string | null =>
    assets.find((a) => a.role === role)?.id ?? null;

  const characters: Character[] = [];
  for (const [id, { name, assets }] of byChar) {
    const concept = assets.find((a) => a.role === 'character-concept');
    const description =
      concept?.description ?? assets.find((a) => a.description)?.description ?? '';
    characters.push({
      id,
      name,
      description,
      faceAssetId: find(assets, 'character-face'),
      bodyAssetId: find(assets, 'character-body'),
      conceptAssetId: find(assets, 'character-concept'),
      voiceAssetId: find(assets, 'voice'),
    });
  }
  characters.sort((a, b) => a.name.localeCompare(b.name));
  return characters;
}

export async function listCharacters(projectId: string): Promise<Character[]> {
  return deriveCharacters(await getProject(projectId));
}

export async function getCharacter(projectId: string, charId: string): Promise<Character> {
  const character = (await listCharacters(projectId)).find((c) => c.id === charId);
  if (!character) throw notFound('Character');
  return character;
}
