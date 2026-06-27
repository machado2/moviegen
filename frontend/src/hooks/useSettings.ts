import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AppSettingsDTO } from '@mediagen/types';
import { api, ApiClientError, type SettingsPatch } from '@/api/client';

export interface UseSettingsResult {
  settings: AppSettingsDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<void>;
}

// Settings live in a single module-level store shared by every component, not
// in per-component useState. Otherwise each `useSettings()` caller kept its own
// snapshot, so changing the model in Settings left other mounted views (e.g.
// the parse confirm dialog in Overview) showing the stale model. With a shared
// store, an `update()` anywhere is seen everywhere instantly.
interface SettingsState {
  settings: AppSettingsDTO | null;
  loading: boolean;
  error: string | null;
}

let state: SettingsState = { settings: null, loading: true, error: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<SettingsState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SettingsState {
  return state;
}

let inflight: Promise<void> | null = null;

function load(): Promise<void> {
  if (inflight) return inflight;
  setState({ loading: true, error: null });
  inflight = (async () => {
    try {
      setState({ settings: await api.settings.get(), loading: false });
    } catch (e) {
      setState({ error: e instanceof ApiClientError ? e.message : String(e), loading: false });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

let started = false;

export function useSettings(): UseSettingsResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  // Fetch once for the whole app, on the first mount of any consumer.
  useEffect(() => {
    if (!started) {
      started = true;
      void load();
    }
  }, []);

  const reload = useCallback(() => load(), []);
  const update = useCallback(async (patch: SettingsPatch) => {
    setState({ settings: await api.settings.update(patch) });
  }, []);

  return { settings: snapshot.settings, loading: snapshot.loading, error: snapshot.error, reload, update };
}
