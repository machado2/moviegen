import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobProgress, MovieAssemblyStatus } from '@mediagen/types';
import { api, ApiClientError } from '@/api/client';

export interface UseAssemblyResult {
  status: MovieAssemblyStatus | null;
  loading: boolean;
  error: string | null;
  jobs: Record<string, JobProgress>;
  reload: () => Promise<void>;
  assembleScene: (sceneId: string) => Promise<void>;
  assembleMovie: () => Promise<void>;
}

export function useAssembly(projectId: string | null): UseAssemblyResult {
  const [status, setStatus] = useState<MovieAssemblyStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, JobProgress>>({});
  const unsubscribers = useRef<Array<() => void>>([]);

  const reload = useCallback(async () => {
    if (!projectId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await api.assembly.status(projectId);
      setStatus(s);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(
    () => () => {
      unsubscribers.current.forEach((u) => u());
      unsubscribers.current = [];
    },
    [],
  );

  const track = useCallback(
    (jobId: string) => {
      if (!projectId) return;
      const unsub = api.assembly.subscribeJob(
        projectId,
        jobId,
        (p) => {
          setJobs((prev) => ({ ...prev, [jobId]: p }));
          if (p.status === 'done' || p.status === 'error') {
            void reload();
          }
        },
        () => {
          void reload();
        },
      );
      unsubscribers.current.push(unsub);
    },
    [projectId, reload],
  );

  const assembleScene = useCallback(
    async (sceneId: string) => {
      if (!projectId) return;
      const { jobId } = await api.assembly.assembleScene(projectId, sceneId);
      track(jobId);
    },
    [projectId, track],
  );

  const assembleMovie = useCallback(async () => {
    if (!projectId) return;
    const { jobId } = await api.assembly.assembleMovie(projectId);
    track(jobId);
  }, [projectId, track]);

  return {
    status,
    loading,
    error,
    jobs,
    reload,
    assembleScene,
    assembleMovie,
  };
}
