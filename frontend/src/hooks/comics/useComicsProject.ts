import { useCallback, useEffect, useState } from 'react';
import type {
  ComicsProject,
  ComicsProjectDTO,
  ComicsProjectSummary,
} from '@mediagen/types';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface UseComicsProjectsResult {
  projects: ComicsProjectSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useComicsProjects(): UseComicsProjectsResult {
  const [projects, setProjects] = useState<ComicsProjectSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await comicsApi.projects.list();
      setProjects(list);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { projects, loading, error, reload };
}

export interface UseComicsProjectResult {
  project: ComicsProjectDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<ComicsProject>) => Promise<void>;
}

export function useComicsProject(
  projectId: string | null,
): UseComicsProjectResult {
  const [project, setProject] = useState<ComicsProjectDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await comicsApi.projects.get(projectId);
      setProject(p);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<ComicsProject>) => {
      if (!projectId) return;
      const updated = await comicsApi.projects.update(projectId, patch);
      setProject(updated);
    },
    [projectId],
  );

  return { project, loading, error, reload, update };
}
