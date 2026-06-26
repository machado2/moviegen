// Incremental character creation, shared by the co-creation agent. A "character"
// in this project is a pair of pending assets on the project: a concept image
// (role character-concept) and a voice timbre sample (role voice). This mirrors
// what applyParsedScript does in bulk, but for one character added live.

import type { Asset, AssetRole, Character, Project } from '@mediagen/types';
import { getProject, saveProject } from './project.js';
import { slugify } from '../lib/ids.js';
import { notFound } from '../lib/errors.js';
import * as fs from '../storage/filesystem.js';

export interface AddCharacterInput {
  id?: string;
  name: string;
  description?: string;
  voiceDescription?: string;
}

/**
 * Add a character (concept + voice assets) to the live project, idempotent on
 * the concept asset id. Returns the concept asset id (the stable character ref).
 */
export async function addCharacter(projectId: string, input: AddCharacterInput): Promise<string> {
  const project = await getProject(projectId);
  const slug = slugify(input.id || input.name);
  if (!slug) return slug;

  if (!project.assets[slug]) {
    const conceptAsset: Asset = {
      id: slug,
      type: 'image',
      role: 'character-concept',
      status: 'pending',
      file: null,
      prompt: 'Reference image for {ref}.',
      characterName: input.name,
      description: input.description ?? '',
    };
    const voiceAsset: Asset = {
      id: `${slug}-voice`,
      type: 'audio',
      role: 'voice',
      status: 'pending',
      file: null,
      prompt: 'Voice timbre sample for {ref}.',
      characterName: input.name,
      description: input.voiceDescription ?? '',
    };
    project.assets[conceptAsset.id] = conceptAsset;
    project.assets[voiceAsset.id] = voiceAsset;
    await saveProject(project);
    await fs.commitProject(projectId, `personagem criado: ${input.name}`);
  }
  return slug;
}

/** Lightweight list of the project's characters (concept assets), for agent context. */
export function characterContext(project: Project): { id: string; name: string; description: string }[] {
  return Object.values(project.assets)
    .filter((a) => a.role === 'character-concept')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id, description: a.description ?? '' }));
}

// ─── Character read-model (derived from assets, not stored) ───────────────────

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
    const description = concept?.description ?? assets.find((a) => a.description)?.description ?? '';
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
