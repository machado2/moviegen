import type { CreateProjectInput, Project, ProjectDTO, ProjectSummary } from '@mediagen/types';
import { apiKeyHint } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { newId, nowIso, slugify } from '../lib/ids.js';
import { DEFAULT_PARSE_MODEL, DEFAULT_TTS_MODEL } from '../config.js';
import { notFound } from '../lib/errors.js';

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const base = slugify(input.title);
  const id = `${base}-${newId().slice(0, 6)}`;
  const now = nowIso();
  const project: Project = {
    id,
    title: input.title,
    language: input.language ?? 'en',
    createdAt: now,
    updatedAt: now,
    globalStyle: input.globalStyle ?? '',
    method: [],
    restrictions: [],
    assets: {},
    scenes: [],
    openrouterApiKey: null,
    parseModel: DEFAULT_PARSE_MODEL,
    ttsModel: DEFAULT_TTS_MODEL,
  };
  await fs.writeNickel(fs.projectFile(id), project);
  await fs.ensureDir(fs.scenesDir(id));
  await fs.ensureDir(fs.assetsDir(id));
  return project;
}

export async function getProject(id: string): Promise<Project> {
  if (!(await fs.pathExists(fs.projectFile(id)))) throw notFound('Project');
  return fs.readNickel<Project>(fs.projectFile(id));
}

export async function saveProject(project: Project): Promise<Project> {
  project.updatedAt = nowIso();
  await fs.writeNickel(fs.projectFile(project.id), project);
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  if (!(await fs.pathExists(fs.projectFile(id)))) throw notFound('Project');
  await fs.remove(fs.projectDir(id));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const ids = await fs.listProjectIds();
  const summaries: ProjectSummary[] = [];
  for (const id of ids) {
    try {
      const p = await fs.readNickel<Project>(fs.projectFile(id));
      summaries.push({
        id: p.id,
        title: p.title,
        language: p.language,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        sceneCount: p.scenes.length,
      });
    } catch {
      // Skip directories without a valid project.ncl.
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

/** Strip the API key before sending a project over the wire. */
export function toDTO(project: Project): ProjectDTO {
  const { openrouterApiKey, ...rest } = project;
  return {
    ...rest,
    hasApiKey: Boolean(openrouterApiKey),
    apiKeyHint: apiKeyHint(openrouterApiKey),
  };
}

export interface UpdateProjectInput {
  title?: string;
  language?: string;
  globalStyle?: string;
  method?: string[];
  restrictions?: string[];
  parseModel?: string;
  ttsModel?: string;
  openrouterApiKey?: string | null;
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  const project = await getProject(id);
  if (patch.title !== undefined) project.title = patch.title;
  if (patch.language !== undefined) project.language = patch.language;
  if (patch.globalStyle !== undefined) project.globalStyle = patch.globalStyle;
  if (patch.method !== undefined) project.method = patch.method;
  if (patch.restrictions !== undefined) project.restrictions = patch.restrictions;
  if (patch.parseModel !== undefined) project.parseModel = patch.parseModel;
  if (patch.ttsModel !== undefined) project.ttsModel = patch.ttsModel;
  // Empty string clears the key; undefined leaves it untouched.
  if (patch.openrouterApiKey !== undefined) {
    project.openrouterApiKey = patch.openrouterApiKey ? patch.openrouterApiKey : null;
  }
  return saveProject(project);
}
