import type {
  ApiError,
  AssetVariant,
  BookAssemblyStatus,
  BookFormat,
  ComicsAsset,
  ComicsCharacter,
  ComicsProject,
  ComicsProjectDTO,
  ComicsProjectSummary,
  JobProgress,
  MontagemOptions,
  ParsedComicsScript,
  Prancha,
  PranchaAssemblyStatus,
  PranchaLayout,
  PranchaRef,
  Quadro,
  Render,
  SpendDTO,
} from '@mediagen/types';

const BASE = '/api/v1/comics';

/** One entry in a project's version history (git commit). */
export interface HistoryEntry {
  hash: string;
  shortHash: string;
  message: string;
  date: string; // ISO 8601
}

export class ComicsApiError extends Error {
  status: number;
  details?: string[];
  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = 'ComicsApiError';
    this.status = status;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ComicsApiError> {
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
  return new ComicsApiError(message, res.status, details);
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

export interface CreateComicsProjectInput {
  title: string;
  language?: string;
}

export const comicsProjectsApi = {
  list(): Promise<ComicsProjectSummary[]> {
    return request('/projects');
  },
  create(input: CreateComicsProjectInput): Promise<ComicsProjectDTO> {
    return request('/projects', { method: 'POST', body: json(input) });
  },
  get(id: string): Promise<ComicsProjectDTO> {
    return request(`/projects/${id}`);
  },
  update(
    id: string,
    patch: Partial<ComicsProject>,
  ): Promise<ComicsProjectDTO> {
    return request(`/projects/${id}`, { method: 'PUT', body: json(patch) });
  },
  remove(id: string): Promise<void> {
    return request(`/projects/${id}`, { method: 'DELETE' });
  },
  exportUrl(id: string, opts?: { media?: 'full' | 'structure' }): string {
    const q = opts?.media === 'structure' ? '?media=structure' : '';
    return `${BASE}/projects/${id}/export${q}`;
  },
  export(id: string, opts?: { media?: 'full' | 'structure' }): void {
    const a = document.createElement('a');
    a.href = comicsProjectsApi.exportUrl(id, opts);
    a.download = `${id}${opts?.media === 'structure' ? '-estrutura' : ''}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  import(file: File): Promise<ComicsProjectDTO> {
    const form = new FormData();
    form.append('file', file);
    return request('/projects/import', { method: 'POST', body: form });
  },
  history(id: string): Promise<HistoryEntry[]> {
    return request(`/projects/${id}/history`);
  },
  restore(id: string, hash: string): Promise<ComicsProjectDTO> {
    return request(`/projects/${id}/restore`, { method: 'POST', body: json({ hash }) });
  },
  spend(id: string): Promise<SpendDTO> {
    return request(`/projects/${id}/spend`);
  },
};

// ─── Script ───────────────────────────────────────────────────────────────────

export const comicsScriptApi = {
  uploadFile(projectId: string, file: File): Promise<ComicsProjectDTO> {
    const form = new FormData();
    form.append('file', file);
    return request(`/projects/${projectId}/script`, {
      method: 'POST',
      body: form,
    });
  },
  uploadContent(
    projectId: string,
    content: string,
  ): Promise<ComicsProjectDTO> {
    return request(`/projects/${projectId}/script`, {
      method: 'POST',
      body: json({ content }),
    });
  },
  // Parse is a background job: returns a jobId to follow over SSE
  // (comicsAssemblyApi.subscribeJob), then fetch the result with parsed().
  parse(projectId: string): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/script/parse`, { method: 'POST' });
  },
  // The pending parsed-but-not-applied script, or null. Survives reloads.
  parsed(projectId: string): Promise<ParsedComicsScript | null> {
    return request(`/projects/${projectId}/script/parsed`);
  },
  // The parse job currently running for this project, or null. Lets the UI
  // re-attach to an in-flight parse after a reload.
  parseActive(projectId: string): Promise<JobProgress | null> {
    return request(`/projects/${projectId}/script/parse/active`);
  },
  cancelParse(projectId: string): Promise<{ cancelled: boolean }> {
    return request(`/projects/${projectId}/script/parse/cancel`, { method: 'POST' });
  },
  apply(
    projectId: string,
    parsed: ParsedComicsScript,
  ): Promise<ComicsProjectDTO> {
    return request(`/projects/${projectId}/script/apply`, {
      method: 'POST',
      body: json(parsed),
    });
  },
  structuredImport(
    projectId: string,
    project: ComicsProject,
    pranchasData?: Prancha[],
  ): Promise<ComicsProjectDTO> {
    return request(`/projects/${projectId}/structured-import`, {
      method: 'POST',
      body: json({ ...project, pranchasData }),
    });
  },
};

// ─── Characters ─────────────────────────────────────────────────────────────────

export const comicsCharactersApi = {
  list(projectId: string): Promise<ComicsCharacter[]> {
    return request(`/projects/${projectId}/characters`);
  },
  get(projectId: string, charId: string): Promise<ComicsCharacter> {
    return request(`/projects/${projectId}/characters/${charId}`);
  },
};

// ─── Assets ─────────────────────────────────────────────────────────────────────

export interface CreateComicsAssetInput {
  role: ComicsAsset['role'];
  status?: ComicsAsset['status'];
  characterName?: string;
  characterDescription?: string;
  description?: string;
}

export const comicsAssetsApi = {
  list(projectId: string): Promise<ComicsAsset[]> {
    return request(`/projects/${projectId}/assets`);
  },
  create(
    projectId: string,
    input: CreateComicsAssetInput,
  ): Promise<ComicsAsset> {
    return request(`/projects/${projectId}/assets`, {
      method: 'POST',
      body: json(input),
    });
  },
  get(projectId: string, assetId: string): Promise<ComicsAsset> {
    return request(`/projects/${projectId}/assets/${assetId}`);
  },
  update(
    projectId: string,
    assetId: string,
    patch: Partial<ComicsAsset>,
  ): Promise<ComicsAsset> {
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
  upload(projectId: string, assetId: string, file: File): Promise<ComicsAsset> {
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
  /** Generate the character reference image via the gateway. Returns a job id. */
  generateImage(
    projectId: string,
    assetId: string,
    opts?: { model?: string; prompt?: string },
  ): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/assets/${assetId}/generate-image`, {
      method: 'POST',
      body: json(opts ?? {}),
    });
  },
  // ─── Variants (generated/uploaded candidates) ──────────────────────────────
  listVariants(projectId: string, assetId: string): Promise<AssetVariant[]> {
    return request(`/projects/${projectId}/assets/${assetId}/variants`);
  },
  variantUrl(projectId: string, assetId: string, variantId: string): string {
    return `${BASE}/projects/${projectId}/assets/${assetId}/variants/${variantId}`;
  },
  selectVariant(projectId: string, assetId: string, variantId: string | null): Promise<ComicsAsset> {
    return request(`/projects/${projectId}/assets/${assetId}/selected-variant`, {
      method: 'PUT',
      body: json({ variantId }),
    });
  },
  removeVariant(projectId: string, assetId: string, variantId: string): Promise<ComicsAsset> {
    return request(`/projects/${projectId}/assets/${assetId}/variants/${variantId}`, {
      method: 'DELETE',
    });
  },
};

// ─── Pranchas ─────────────────────────────────────────────────────────────────

export interface CreatePranchaInput {
  shortTitle: string;
  layout: PranchaLayout;
  origin?: string;
  number?: number;
  autoQuadros?: boolean;
}

export const comicsPranchasApi = {
  list(projectId: string): Promise<PranchaRef[]> {
    return request(`/projects/${projectId}/pranchas`);
  },
  create(projectId: string, input: CreatePranchaInput): Promise<Prancha> {
    return request(`/projects/${projectId}/pranchas`, {
      method: 'POST',
      body: json(input),
    });
  },
  get(projectId: string, pranchaId: string): Promise<Prancha> {
    return request(`/projects/${projectId}/pranchas/${pranchaId}`);
  },
  update(
    projectId: string,
    pranchaId: string,
    patch: Partial<Prancha>,
  ): Promise<Prancha> {
    return request(`/projects/${projectId}/pranchas/${pranchaId}`, {
      method: 'PUT',
      body: json(patch),
    });
  },
  remove(projectId: string, pranchaId: string): Promise<void> {
    return request(`/projects/${projectId}/pranchas/${pranchaId}`, {
      method: 'DELETE',
    });
  },
  reorder(projectId: string, pranchaIds: string[]): Promise<PranchaRef[]> {
    return request(`/projects/${projectId}/pranchas/reorder`, {
      method: 'POST',
      body: json({ pranchaIds }),
    });
  },
};

// ─── Quadros ─────────────────────────────────────────────────────────────────

export const comicsQuadrosApi = {
  add(
    projectId: string,
    pranchaId: string,
    quadro: Partial<Quadro>,
  ): Promise<Quadro> {
    return request(`/projects/${projectId}/pranchas/${pranchaId}/quadros`, {
      method: 'POST',
      body: json(quadro),
    });
  },
  update(
    projectId: string,
    pranchaId: string,
    quadroId: string,
    patch: Partial<Quadro>,
  ): Promise<Quadro> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}`,
      { method: 'PUT', body: json(patch) },
    );
  },
  remove(
    projectId: string,
    pranchaId: string,
    quadroId: string,
  ): Promise<void> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}`,
      { method: 'DELETE' },
    );
  },
  reorder(
    projectId: string,
    pranchaId: string,
    quadroIds: string[],
  ): Promise<Quadro[]> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/reorder`,
      { method: 'POST', body: json({ quadroIds }) },
    );
  },
  prompt(
    projectId: string,
    pranchaId: string,
    quadroId: string,
  ): Promise<{ prompt: string }> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/prompt`,
      { method: 'POST' },
    );
  },
};

// ─── Renders ─────────────────────────────────────────────────────────────────

export const comicsRendersApi = {
  list(
    projectId: string,
    pranchaId: string,
    quadroId: string,
  ): Promise<Render[]> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/renders`,
    );
  },
  upload(
    projectId: string,
    pranchaId: string,
    quadroId: string,
    file: File,
  ): Promise<Render> {
    const form = new FormData();
    form.append('file', file);
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/renders`,
      { method: 'POST', body: form },
    );
  },
  generate(
    projectId: string,
    pranchaId: string,
    quadroId: string,
    opts?: { model?: string; useCodex?: boolean },
  ): Promise<{ jobId: string }> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/renders/generate`,
      { method: 'POST', body: json(opts ?? {}) },
    );
  },
  imageUrl(
    projectId: string,
    pranchaId: string,
    quadroId: string,
    renderId: string,
  ): string {
    return `${BASE}/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/renders/${renderId}`;
  },
  remove(
    projectId: string,
    pranchaId: string,
    quadroId: string,
    renderId: string,
  ): Promise<void> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/renders/${renderId}`,
      { method: 'DELETE' },
    );
  },
  select(
    projectId: string,
    pranchaId: string,
    quadroId: string,
    renderId: string | null,
  ): Promise<Quadro> {
    return request(
      `/projects/${projectId}/pranchas/${pranchaId}/quadros/${quadroId}/selected-render`,
      { method: 'PUT', body: json({ renderId }) },
    );
  },
};

// ─── Assembly ─────────────────────────────────────────────────────────────────

export const comicsAssemblyApi = {
  assemblePrancha(
    projectId: string,
    pranchaId: string,
    options?: Partial<MontagemOptions>,
  ): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/pranchas/${pranchaId}/assemble`, {
      method: 'POST',
      body: json(options ?? {}),
    });
  },
  pranchaStatus(
    projectId: string,
    pranchaId: string,
  ): Promise<PranchaAssemblyStatus> {
    return request(`/projects/${projectId}/pranchas/${pranchaId}/assembly`);
  },
  pranchaOutputUrl(projectId: string, pranchaId: string): string {
    return `${BASE}/projects/${projectId}/pranchas/${pranchaId}/output`;
  },
  bookStatus(projectId: string): Promise<BookAssemblyStatus> {
    return request(`/projects/${projectId}/assembly`);
  },
  assembleBook(
    projectId: string,
    formats?: BookFormat[],
  ): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/assemble`, {
      method: 'POST',
      body: json(formats ? { formats } : {}),
    });
  },
  bookOutputUrl(projectId: string, format: BookFormat): string {
    return `${BASE}/projects/${projectId}/output/${format}`;
  },
  /** One-shot job status, to reconcile after a dropped SSE stream. */
  getJob(projectId: string, jobId: string): Promise<JobProgress> {
    return request(`/projects/${projectId}/jobs/${jobId}`);
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

export const comicsApi = {
  projects: comicsProjectsApi,
  script: comicsScriptApi,
  characters: comicsCharactersApi,
  assets: comicsAssetsApi,
  pranchas: comicsPranchasApi,
  quadros: comicsQuadrosApi,
  renders: comicsRendersApi,
  assembly: comicsAssemblyApi,
};

export default comicsApi;
