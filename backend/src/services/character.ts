// Incremental character creation, shared by the co-creation agent. A "character"
// in this project is a pair of pending assets on the project: a concept image
// (role character-concept) and a voice timbre sample (role voice). This mirrors
// what applyParsedScript does in bulk, but for one character added live.

import type { Asset, Project } from '@mediagen/types';
import { getProject, saveProject } from './project.js';
import { slugify } from '../lib/ids.js';
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

/** Lightweight list of the project's characters (concept assets), for context. */
export function listCharacters(project: Project): { id: string; name: string; description: string }[] {
  return Object.values(project.assets)
    .filter((a) => a.role === 'character-concept')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id, description: a.description ?? '' }));
}
