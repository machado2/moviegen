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

let state: SettingsState = { settings: null, loading: false, error: null };
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

const errorMessage = (e: unknown): string => (e instanceof ApiClientError ? e.message : String(e));

// Bumped on every successful write. A GET that started before a write must not
// clobber the newer value when it finally resolves.
let writeVersion = 0;
let inflight: Promise<void> | null = null;

function load(): Promise<void> {
  if (inflight) return inflight;
  const startedAt = writeVersion;
  setState({ loading: true, error: null });
  inflight = (async () => {
    try {
      const fresh = await api.settings.get();
      // Skip the overwrite if an update landed while this GET was in flight.
      if (writeVersion === startedAt) setState({ settings: fresh, loading: false });
      else setState({ loading: false });
    } catch (e) {
      setState({ error: errorMessage(e), loading: false });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Writes are serialized into a chain so overlapping PATCHes (e.g. arrow-keying
// through the parse-model select) apply in call order — last call wins, instead
// of last response landing. Each write bumps writeVersion so an in-flight load
// can't revert it.
let writeChain: Promise<unknown> = Promise.resolve();

function applyUpdate(patch: SettingsPatch): Promise<void> {
  const run = writeChain.then(async () => {
    const updated = await api.settings.update(patch);
    writeVersion += 1;
    setState({ settings: updated, error: null });
  });
  writeChain = run.catch(() => undefined);
  return run;
}

// Trigger a load if we don't have settings yet and none is in flight. Called on
// every consumer mount, so a transient first-load failure self-heals as the user
// navigates (each new mount retries) instead of bricking settings for the whole
// session.
function ensureLoaded(): void {
  if (!state.settings && !inflight) void load();
}

export function useSettings(): UseSettingsResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ensureLoaded();
  }, []);

  const reload = useCallback(() => load(), []);
  const update = useCallback((patch: SettingsPatch) => applyUpdate(patch), []);

  return { settings: snapshot.settings, loading: snapshot.loading, error: snapshot.error, reload, update };
}
