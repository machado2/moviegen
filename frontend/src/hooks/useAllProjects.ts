import { useCallback, useEffect, useState } from 'react';
import type { AllProjectSummary } from '@mediagen/types';
import { api, ApiClientError } from '@/api/client';

export interface UseAllProjectsResult {
  projects: AllProjectSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useAllProjects(): UseAllProjectsResult {
  const [projects, setProjects] = useState<AllProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await api.allProjects.list());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { projects, loading, error, reload };
}
