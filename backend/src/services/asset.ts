import type { Asset, AssetRole, AssetStatus, AssetType, Character, Project } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, slugify } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';

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
  return asset;
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  delete project.assets[assetId];
  await saveProject(project);
  if (asset.file) {
    await fs.remove(fs.resolveInProject(projectId, asset.file));
  }
}

export async function uploadAssetFile(
  projectId: string,
  assetId: string,
  data: Buffer,
  originalName: string,
): Promise<Asset> {
  const project = await getProject(projectId);
  const asset = project.assets[assetId];
  if (!asset) throw notFound('Asset');
  const ext = (originalName.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const rel = `assets/${assetId}.${ext}`;
  await fs.writeBuffer(fs.resolveInProject(projectId, rel), data);
  // Remove a previous file with a different extension.
  if (asset.file && asset.file !== rel) {
    await fs.remove(fs.resolveInProject(projectId, asset.file));
  }
  asset.file = rel;
  if (asset.status === 'pending') asset.status = 'active';
  await saveProject(project);
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
