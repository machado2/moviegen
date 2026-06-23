import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobProgress, Prancha, PranchaRef, Quadro } from '@mediagen/types';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface UsePranchasResult {
  pranchas: PranchaRef[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function usePranchas(projectId: string | null): UsePranchasResult {
  const [pranchas, setPranchas] = useState<PranchaRef[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) {
      setPranchas([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await comicsApi.pranchas.list(projectId);
      setPranchas([...list].sort((a, b) => a.number - b.number));
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { pranchas, loading, error, reload };
}

export interface UsePranchaResult {
  prancha: Prancha | null;
  loading: boolean;
  error: string | null;
  jobs: Record<string, JobProgress>;
  reload: () => Promise<void>;
  updateQuadro: (quadroId: string, patch: Partial<Quadro>) => Promise<void>;
  deleteQuadro: (quadroId: string) => Promise<void>;
  selectRender: (quadroId: string, renderId: string | null) => Promise<void>;
  generateRender: (quadroId: string) => Promise<{ jobId: string }>;
}

export function usePrancha(
  projectId: string | null,
  pranchaId: string | null,
): UsePranchaResult {
  const [prancha, setPrancha] = useState<Prancha | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, JobProgress>>({});
  const unsubscribers = useRef<Array<() => void>>([]);

  const reload = useCallback(async () => {
    if (!projectId || !pranchaId) {
      setPrancha(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await comicsApi.pranchas.get(projectId, pranchaId);
      setPrancha(p);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, pranchaId]);

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

  const updateQuadro = useCallback(
    async (quadroId: string, patch: Partial<Quadro>) => {
      if (!projectId || !pranchaId) return;
      await comicsApi.quadros.update(projectId, pranchaId, quadroId, patch);
      await reload();
    },
    [projectId, pranchaId, reload],
  );

  const deleteQuadro = useCallback(
    async (quadroId: string) => {
      if (!projectId || !pranchaId) return;
      await comicsApi.quadros.remove(projectId, pranchaId, quadroId);
      await reload();
    },
    [projectId, pranchaId, reload],
  );

  const selectRender = useCallback(
    async (quadroId: string, renderId: string | null) => {
      if (!projectId || !pranchaId) return;
      await comicsApi.renders.select(projectId, pranchaId, quadroId, renderId);
      await reload();
    },
    [projectId, pranchaId, reload],
  );

  const generateRender = useCallback(
    async (quadroId: string) => {
      if (!projectId || !pranchaId) {
        throw new Error('No prancha selected');
      }
      const { jobId } = await comicsApi.renders.generate(
        projectId,
        pranchaId,
        quadroId,
      );
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
      return { jobId };
    },
    [projectId, pranchaId, reload],
  );

  return {
    prancha,
    loading,
    error,
    jobs,
    reload,
    updateQuadro,
    deleteQuadro,
    selectRender,
    generateRender,
  };
}
