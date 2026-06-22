import { useCallback, useEffect, useState } from 'react';
import type { Project, ProjectDTO, ProjectSummary } from '@moviegen/types';
import { api, ApiClientError } from '@/api/client';

export interface UseProjectsResult {
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.projects.list();
      setProjects(list);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { projects, loading, error, reload };
}

export interface UseProjectResult {
  project: ProjectDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<Project>) => Promise<void>;
}

export function useProject(projectId: string | null): UseProjectResult {
  const [project, setProject] = useState<ProjectDTO | null>(null);
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
      const p = await api.projects.get(projectId);
      setProject(p);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<Project>) => {
      if (!projectId) return;
      const updated = await api.projects.update(projectId, patch);
      setProject(updated);
    },
    [projectId],
  );

  return { project, loading, error, reload, update };
}
