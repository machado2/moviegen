// Character read-model for the comics format — derived from assets, not stored.
// The film equivalent is backend/src/services/character.ts.

import type { ComicsCharacter, ComicsProject } from '@mediagen/types';
import { getProject } from './project.js';
import { slugify } from '../../lib/ids.js';
import { notFound } from '../../lib/errors.js';

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
