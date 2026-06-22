import type {
  ComicsProject,
  ComicsProjectDTO,
  ComicsProjectSummary,
} from '@moviegen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { newId, nowIso, slugify } from '../../lib/ids.js';
import { DEFAULT_PARSE_MODEL } from '../../config.js';
import { notFound } from '../../lib/errors.js';

export interface CreateComicsProjectInput {
  title: string;
  language?: string;
  globalStyle?: string;
}

export async function createProject(input: CreateComicsProjectInput): Promise<ComicsProject> {
  const id = `${slugify(input.title)}-${newId().slice(0, 6)}`;
  const now = nowIso();
  const project: ComicsProject = {
    id,
    title: input.title,
    language: input.language ?? 'pt-BR',
    createdAt: now,
    updatedAt: now,
    globalStyle: input.globalStyle ?? '',
    restrictions: [],
    assets: {},
    pranchas: [],
    openrouterApiKey: null,
    parseModel: DEFAULT_PARSE_MODEL,
  };
  await fs.writeJson(cfs.projectFile(id), project);
  await fs.ensureDir(cfs.pranchasDir(id));
  await fs.ensureDir(cfs.assetsDir(id));
  return project;
}

export async function getProject(id: string): Promise<ComicsProject> {
  if (!(await fs.pathExists(cfs.projectFile(id)))) throw notFound('Comics project');
  return fs.readJson<ComicsProject>(cfs.projectFile(id));
}

export async function saveProject(project: ComicsProject): Promise<ComicsProject> {
  project.updatedAt = nowIso();
  await fs.writeJson(cfs.projectFile(project.id), project);
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  if (!(await fs.pathExists(cfs.projectFile(id)))) throw notFound('Comics project');
  await fs.remove(cfs.projectDir(id));
}

export async function listProjects(): Promise<ComicsProjectSummary[]> {
  const ids = await cfs.listProjectIds();
  const out: ComicsProjectSummary[] = [];
  for (const id of ids) {
    try {
      const p = await fs.readJson<ComicsProject>(cfs.projectFile(id));
      out.push({
        id: p.id,
        title: p.title,
        language: p.language,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        pranchaCount: p.pranchas.length,
      });
    } catch {
      // skip non-project dirs
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export function toDTO(project: ComicsProject): ComicsProjectDTO {
  const { openrouterApiKey, ...rest } = project;
  return { ...rest, hasApiKey: Boolean(openrouterApiKey) };
}

export interface UpdateComicsProjectInput {
  title?: string;
  language?: string;
  globalStyle?: string;
  restrictions?: string[];
  parseModel?: string;
  openrouterApiKey?: string | null;
}

export async function updateProject(
  id: string,
  patch: UpdateComicsProjectInput,
): Promise<ComicsProject> {
  const project = await getProject(id);
  if (patch.title !== undefined) project.title = patch.title;
  if (patch.language !== undefined) project.language = patch.language;
  if (patch.globalStyle !== undefined) project.globalStyle = patch.globalStyle;
  if (patch.restrictions !== undefined) project.restrictions = patch.restrictions;
  if (patch.parseModel !== undefined) project.parseModel = patch.parseModel;
  if (patch.openrouterApiKey !== undefined) {
    project.openrouterApiKey = patch.openrouterApiKey ? patch.openrouterApiKey : null;
  }
  return saveProject(project);
}
