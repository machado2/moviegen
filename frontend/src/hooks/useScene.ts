import { useCallback, useEffect, useState } from 'react';
import type { Scene, SceneRef, Shot } from '@mediagen/types';
import { api, ApiClientError } from '@/api/client';

export interface UseScenesResult {
  scenes: SceneRef[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useScenes(projectId: string | null): UseScenesResult {
  const [scenes, setScenes] = useState<SceneRef[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) {
      setScenes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.scenes.list(projectId);
      setScenes([...list].sort((a, b) => a.number - b.number));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { scenes, loading, error, reload };
}

export interface UseSceneResult {
  scene: Scene | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  updateShot: (shotId: string, patch: Partial<Shot>) => Promise<void>;
  selectTake: (shotId: string, takeId: string | null) => Promise<void>;
  deleteShot: (shotId: string) => Promise<void>;
  addShot: (shot: Partial<Shot>) => Promise<void>;
}

export function useScene(
  projectId: string | null,
  sceneId: string | null,
): UseSceneResult {
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId || !sceneId) {
      setScene(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await api.scenes.get(projectId, sceneId);
      setScene(s);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, sceneId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateShot = useCallback(
    async (shotId: string, patch: Partial<Shot>) => {
      if (!projectId || !sceneId) return;
      await api.shots.update(projectId, sceneId, shotId, patch);
      await reload();
    },
    [projectId, sceneId, reload],
  );

  const selectTake = useCallback(
    async (shotId: string, takeId: string | null) => {
      if (!projectId || !sceneId) return;
      await api.takes.select(projectId, sceneId, shotId, takeId);
      await reload();
    },
    [projectId, sceneId, reload],
  );

  const deleteShot = useCallback(
    async (shotId: string) => {
      if (!projectId || !sceneId) return;
      await api.shots.remove(projectId, sceneId, shotId);
      await reload();
    },
    [projectId, sceneId, reload],
  );

  const addShot = useCallback(
    async (shot: Partial<Shot>) => {
      if (!projectId || !sceneId) return;
      await api.shots.add(projectId, sceneId, shot);
      await reload();
    },
    [projectId, sceneId, reload],
  );

  return {
    scene,
    loading,
    error,
    reload,
    updateShot,
    selectTake,
    deleteShot,
    addShot,
  };
}
