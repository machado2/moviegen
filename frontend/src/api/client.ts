import type {
  Project,
  ProjectDTO,
  ProjectSummary,
  CreateProjectInput,
  Asset,
  Scene,
  SceneRef,
  Shot,
  Take,
  Character,
  ParsedScript,
  JobProgress,
  MovieAssemblyStatus,
  SceneAssemblyStatus,
  ApiError,
  AppSettingsDTO,
  AllProjectSummary,
} from '@mediagen/types';

const BASE = '/api/v1';

/** One entry in a project's version history (git commit). */
export interface HistoryEntry {
  hash: string;
  shortHash: string;
  message: string;
  date: string; // ISO 8601
}

export class ApiClientError extends Error {
  status: number;
  details?: string[];
  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiClientError> {
  let message = `${res.status} ${res.statusText}`;
  let details: string[] | undefined;
  try {
    const body = (await res.json()) as ApiError;
    if (body && typeof body.error === 'string') {
      message = body.error;
      details = body.details;
    }
  } catch {
    // body was not JSON; keep the status-based message
  }
  return new ApiClientError(message, res.status, details);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function json(body: unknown): BodyInit {
  return JSON.stringify(body);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projectsApi = {
  list(): Promise<ProjectSummary[]> {
    return request('/projects');
  },
  create(input: CreateProjectInput): Promise<ProjectDTO> {
    return request('/projects', { method: 'POST', body: json(input) });
  },
  get(id: string): Promise<ProjectDTO> {
    return request(`/projects/${id}`);
  },
  update(id: string, patch: Partial<Project>): Promise<ProjectDTO> {
    return request(`/projects/${id}`, { method: 'PUT', body: json(patch) });
  },
  remove(id: string): Promise<void> {
    return request(`/projects/${id}`, { method: 'DELETE' });
  },
  exportUrl(id: string): string {
    return `${BASE}/projects/${id}/export`;
  },
  async export(id: string): Promise<void> {
    // Trigger a browser download of the project zip.
    const a = document.createElement('a');
    a.href = projectsApi.exportUrl(id);
    a.download = `${id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  import(file: File): Promise<ProjectDTO> {
    const form = new FormData();
    form.append('file', file);
    return request('/projects/import', { method: 'POST', body: form });
  },
  history(id: string): Promise<HistoryEntry[]> {
    return request(`/projects/${id}/history`);
  },
  restore(id: string, hash: string): Promise<ProjectDTO> {
    return request(`/projects/${id}/restore`, { method: 'POST', body: json({ hash }) });
  },
};

// ─── Script ───────────────────────────────────────────────────────────────────

export const scriptApi = {
  upload(projectId: string, file: File): Promise<ProjectDTO> {
    const form = new FormData();
    form.append('file', file);
    return request(`/projects/${projectId}/script`, {
      method: 'POST',
      body: form,
    });
  },
  // Parse is a background job: returns a jobId to follow over SSE
  // (assemblyApi.subscribeJob), then fetch the result with parsed().
  parse(projectId: string): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/script/parse`, { method: 'POST' });
  },
  // The pending parsed-but-not-applied script, or null. Survives reloads.
  parsed(projectId: string): Promise<ParsedScript | null> {
    return request(`/projects/${projectId}/script/parsed`);
  },
  // The parse job currently running for this project, or null. Lets the UI
  // re-attach to an in-flight parse after a reload.
  parseActive(projectId: string): Promise<JobProgress | null> {
    return request(`/projects/${projectId}/script/parse/active`);
  },
  apply(projectId: string, parsed: ParsedScript): Promise<ProjectDTO> {
    return request(`/projects/${projectId}/script/apply`, {
      method: 'POST',
      body: json(parsed),
    });
  },
  structuredImport(projectId: string, project: Project): Promise<ProjectDTO> {
    return request(`/projects/${projectId}/structured-import`, {
      method: 'POST',
      body: json(project),
    });
  },
};

// ─── Characters ───────────────────────────────────────────────────────────────

export const charactersApi = {
  list(projectId: string): Promise<Character[]> {
    return request(`/projects/${projectId}/characters`);
  },
  get(projectId: string, charId: string): Promise<Character> {
    return request(`/projects/${projectId}/characters/${charId}`);
  },
};

// ─── Assets ───────────────────────────────────────────────────────────────────

export const assetsApi = {
  list(projectId: string): Promise<Asset[]> {
    return request(`/projects/${projectId}/assets`);
  },
  create(projectId: string, asset: Partial<Asset>): Promise<Asset> {
    return request(`/projects/${projectId}/assets`, {
      method: 'POST',
      body: json(asset),
    });
  },
  get(projectId: string, assetId: string): Promise<Asset> {
    return request(`/projects/${projectId}/assets/${assetId}`);
  },
  update(projectId: string, assetId: string, patch: Partial<Asset>): Promise<Asset> {
    return request(`/projects/${projectId}/assets/${assetId}`, {
      method: 'PUT',
      body: json(patch),
    });
  },
  remove(projectId: string, assetId: string): Promise<void> {
    return request(`/projects/${projectId}/assets/${assetId}`, {
      method: 'DELETE',
    });
  },
  upload(projectId: string, assetId: string, file: File): Promise<Asset> {
    const form = new FormData();
    form.append('file', file);
    return request(`/projects/${projectId}/assets/${assetId}/upload`, {
      method: 'POST',
      body: form,
    });
  },
  fileUrl(projectId: string, assetId: string): string {
    return `${BASE}/projects/${projectId}/assets/${assetId}/file`;
  },
  generate(projectId: string, assetId: string): Promise<Asset> {
    return request(`/projects/${projectId}/assets/${assetId}/generate`, {
      method: 'POST',
    });
  },
};

// ─── Scenes ───────────────────────────────────────────────────────────────────

export const scenesApi = {
  list(projectId: string): Promise<SceneRef[]> {
    return request(`/projects/${projectId}/scenes`);
  },
  create(projectId: string, scene: Partial<Scene>): Promise<Scene> {
    return request(`/projects/${projectId}/scenes`, {
      method: 'POST',
      body: json(scene),
    });
  },
  get(projectId: string, sceneId: string): Promise<Scene> {
    return request(`/projects/${projectId}/scenes/${sceneId}`);
  },
  update(projectId: string, sceneId: string, patch: Partial<Scene>): Promise<Scene> {
    return request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: 'PUT',
      body: json(patch),
    });
  },
  remove(projectId: string, sceneId: string): Promise<void> {
    return request(`/projects/${projectId}/scenes/${sceneId}`, {
      method: 'DELETE',
    });
  },
  reorder(projectId: string, sceneIds: string[]): Promise<SceneRef[]> {
    return request(`/projects/${projectId}/scenes/reorder`, {
      method: 'POST',
      body: json({ sceneIds }),
    });
  },
};

// ─── Shots ────────────────────────────────────────────────────────────────────

export const shotsApi = {
  add(projectId: string, sceneId: string, shot: Partial<Shot>): Promise<Shot> {
    return request(`/projects/${projectId}/scenes/${sceneId}/shots`, {
      method: 'POST',
      body: json(shot),
    });
  },
  update(
    projectId: string,
    sceneId: string,
    shotId: string,
    patch: Partial<Shot>,
  ): Promise<Shot> {
    return request(
      `/projects/${projectId}/scenes/${sceneId}/shots/${shotId}`,
      { method: 'PUT', body: json(patch) },
    );
  },
  remove(projectId: string, sceneId: string, shotId: string): Promise<void> {
    return request(
      `/projects/${projectId}/scenes/${sceneId}/shots/${shotId}`,
      { method: 'DELETE' },
    );
  },
  reorder(
    projectId: string,
    sceneId: string,
    shotIds: string[],
  ): Promise<Shot[]> {
    return request(`/projects/${projectId}/scenes/${sceneId}/shots/reorder`, {
      method: 'POST',
      body: json({ shotIds }),
    });
  },
};

// ─── Takes ────────────────────────────────────────────────────────────────────

export const takesApi = {
  list(
    projectId: string,
    sceneId: string,
    shotId: string,
  ): Promise<Take[]> {
    return request(
      `/projects/${projectId}/scenes/${sceneId}/shots/${shotId}/takes`,
    );
  },
  upload(
    projectId: string,
    sceneId: string,
    shotId: string,
    file: File,
    notes?: string,
  ): Promise<Take> {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return request(
      `/projects/${projectId}/scenes/${sceneId}/shots/${shotId}/takes`,
      { method: 'POST', body: form },
    );
  },
  streamUrl(
    projectId: string,
    sceneId: string,
    shotId: string,
    takeId: string,
  ): string {
    return `${BASE}/projects/${projectId}/scenes/${sceneId}/shots/${shotId}/takes/${takeId}`;
  },
  remove(
    projectId: string,
    sceneId: string,
    shotId: string,
    takeId: string,
  ): Promise<void> {
    return request(
      `/projects/${projectId}/scenes/${sceneId}/shots/${shotId}/takes/${takeId}`,
      { method: 'DELETE' },
    );
  },
  select(
    projectId: string,
    sceneId: string,
    shotId: string,
    takeId: string | null,
  ): Promise<Shot> {
    return request(
      `/projects/${projectId}/scenes/${sceneId}/shots/${shotId}/selected-take`,
      { method: 'PUT', body: json({ takeId }) },
    );
  },
};

// ─── Assembly ─────────────────────────────────────────────────────────────────

export const assemblyApi = {
  status(projectId: string): Promise<MovieAssemblyStatus> {
    return request(`/projects/${projectId}/assembly`);
  },
  assembleScene(
    projectId: string,
    sceneId: string,
  ): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/scenes/${sceneId}/assemble`, {
      method: 'POST',
    });
  },
  sceneStatus(
    projectId: string,
    sceneId: string,
  ): Promise<SceneAssemblyStatus> {
    return request(`/projects/${projectId}/scenes/${sceneId}/assembly`);
  },
  sceneOutputUrl(projectId: string, sceneId: string): string {
    return `${BASE}/projects/${projectId}/scenes/${sceneId}/output`;
  },
  assembleMovie(projectId: string): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/assemble`, { method: 'POST' });
  },
  movieOutputUrl(projectId: string): string {
    return `${BASE}/projects/${projectId}/output`;
  },
  /**
   * Subscribe to SSE job progress. Returns an unsubscribe function.
   * The server streams `JobProgress` JSON payloads in each event.
   */
  subscribeJob(
    projectId: string,
    jobId: string,
    onProgress: (p: JobProgress) => void,
    onError?: (err: Event) => void,
  ): () => void {
    const url = `${BASE}/projects/${projectId}/jobs/${jobId}/progress`;
    const source = new EventSource(url);
    source.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as JobProgress;
        onProgress(data);
        if (data.status === 'done' || data.status === 'error') {
          source.close();
        }
      } catch {
        // ignore malformed frames (e.g. heartbeats)
      }
    };
    source.onerror = (ev) => {
      onError?.(ev);
      source.close();
    };
    return () => source.close();
  },
};

// ─── All projects (unified) ───────────────────────────────────────────────────

export const allProjectsApi = {
  list(): Promise<AllProjectSummary[]> {
    return request('/all-projects');
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settingsApi = {
  get(): Promise<AppSettingsDTO> {
    return request('/settings');
  },
  update(patch: { llmApiKey?: string | null; parseModel?: string | null; ttsModel?: string | null }): Promise<AppSettingsDTO> {
    return request('/settings', { method: 'PATCH', body: json(patch) });
  },
};

export const api = {
  projects: projectsApi,
  allProjects: allProjectsApi,
  script: scriptApi,
  characters: charactersApi,
  assets: assetsApi,
  scenes: scenesApi,
  shots: shotsApi,
  takes: takesApi,
  assembly: assemblyApi,
  settings: settingsApi,
};

export default api;
