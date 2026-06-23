import type {
  ComicsAsset,
  ComicsProject,
  ParsedComicsScript,
  Prancha,
  PranchaRef,
  Quadro,
} from '@moviegen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, saveProject } from './project.js';
import { newId, slugify } from '../../lib/ids.js';
import { badRequest } from '../../lib/errors.js';
import { slotFormatFor } from '../layout.js';
import { validateComicsProject, validatePrancha } from '../validate.js';

export async function applyParsedComicsScript(
  projectId: string,
  parsed: ParsedComicsScript,
): Promise<ComicsProject> {
  const project = await getProject(projectId);
  project.title = parsed.title || project.title;
  project.language = parsed.language || project.language;
  if (parsed.globalStyle) project.globalStyle = parsed.globalStyle;

  // Character assets (pending). Asset id is the character slug for stable refs.
  const assetIdByChar = new Map<string, string>();
  for (const c of parsed.characters) {
    const charSlug = slugify(c.id || c.name);
    const asset: ComicsAsset = {
      id: charSlug,
      type: 'image',
      role: 'character',
      status: 'pending',
      file: null,
      characterName: c.name,
      characterDescription: c.description,
    };
    project.assets[asset.id] = asset;
    assetIdByChar.set(charSlug, asset.id);
  }

  const refs: PranchaRef[] = [];
  for (const pp of parsed.pranchas) {
    const pranchaId = `prancha-${pp.number}-${slugify(pp.shortTitle).slice(0, 24)}-${newId().slice(0, 4)}`;
    const quadros: Quadro[] = pp.quadros.map((q, i) => ({
      id: newId('quadro'),
      order: i + 1,
      // Trust the layout, not the model, for slot format.
      slotFormat: slotFormatFor(pp.layout, i),
      composition: q.composition,
      characters: (q.characterIds ?? [])
        .map((cid) => assetIdByChar.get(slugify(cid)))
        .filter((id): id is string => Boolean(id)),
      setting: q.setting,
      texts: q.texts ?? [],
      restrictions: q.restrictions ?? [],
      refs: [],
      selectedRenderId: null,
      renders: [],
    }));
    const prancha: Prancha = {
      id: pranchaId,
      number: pp.number,
      shortTitle: pp.shortTitle,
      origin: pp.origin,
      layout: pp.layout,
      quadros,
    };
    await fs.writeNickel(cfs.pranchaFile(projectId, pranchaId), prancha);
    refs.push({ id: pranchaId, number: pp.number, shortTitle: pp.shortTitle, file: `pranchas/${pranchaId}.ncl` });
  }
  refs.sort((a, b) => a.number - b.number);
  project.pranchas = refs;
  return saveProject(project);
}

export type StructuredImportPayload = ComicsProject & { pranchasData?: Prancha[] };

export async function structuredImport(projectId: string, payload: unknown): Promise<ComicsProject> {
  if (typeof payload !== 'object' || payload === null) {
    throw badRequest('Structured import payload must be an object');
  }
  const existing = await getProject(projectId);
  const { pranchasData, ...projectLike } = payload as StructuredImportPayload;

  const projectErrors = validateComicsProject(projectLike);
  if (projectErrors.length) {
    throw badRequest('Project JSON does not match the current format', projectErrors.slice(0, 30));
  }
  const incoming = projectLike as ComicsProject;

  const pranchaErrors: string[] = [];
  (pranchasData ?? []).forEach((p, i) => pranchaErrors.push(...validatePrancha(p, `pranchasData[${i}]`)));
  if (pranchaErrors.length) {
    throw badRequest('Prancha JSON does not match the current format', pranchaErrors.slice(0, 30));
  }

  const project: ComicsProject = {
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    openrouterApiKey: existing.openrouterApiKey ?? null,
    parseModel: incoming.parseModel ?? existing.parseModel,
  };

  await fs.remove(cfs.pranchasDir(projectId));
  const byId = new Map((pranchasData ?? []).map((p) => [p.id, p]));
  const refs: PranchaRef[] = [];
  for (const ref of incoming.pranchas) {
    const prancha = byId.get(ref.id);
    if (prancha) {
      await fs.writeNickel(cfs.pranchaFile(project.id, prancha.id), prancha);
      refs.push({ id: prancha.id, number: prancha.number, shortTitle: prancha.shortTitle, file: `pranchas/${prancha.id}.ncl` });
    } else {
      refs.push(ref);
    }
  }
  refs.sort((a, b) => a.number - b.number);
  project.pranchas = refs;
  return saveProject(project);
}
