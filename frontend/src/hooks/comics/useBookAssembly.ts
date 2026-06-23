import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BookAssemblyStatus,
  BookFormat,
  JobProgress,
  MontagemOptions,
} from '@mediagen/types';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface UseBookAssemblyResult {
  status: BookAssemblyStatus | null;
  loading: boolean;
  error: string | null;
  jobs: Record<string, JobProgress>;
  reload: () => Promise<void>;
  assemblePrancha: (
    pranchaId: string,
    options?: Partial<MontagemOptions>,
  ) => Promise<void>;
  assembleBook: (formats?: BookFormat[]) => Promise<void>;
}

export function useBookAssembly(
  projectId: string | null,
): UseBookAssemblyResult {
  const [status, setStatus] = useState<BookAssemblyStatus | null>(null);
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
      const s = await comicsApi.assembly.bookStatus(projectId);
      setStatus(s);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
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
      const unsub = comicsApi.assembly.subscribeJob(
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

  const assemblePrancha = useCallback(
    async (pranchaId: string, options?: Partial<MontagemOptions>) => {
      if (!projectId) return;
      const { jobId } = await comicsApi.assembly.assemblePrancha(
        projectId,
        pranchaId,
        options,
      );
      track(jobId);
    },
    [projectId, track],
  );

  const assembleBook = useCallback(
    async (formats?: BookFormat[]) => {
      if (!projectId) return;
      const { jobId } = await comicsApi.assembly.assembleBook(
        projectId,
        formats,
      );
      track(jobId);
    },
    [projectId, track],
  );

  return {
    status,
    loading,
    error,
    jobs,
    reload,
    assemblePrancha,
    assembleBook,
  };
}
