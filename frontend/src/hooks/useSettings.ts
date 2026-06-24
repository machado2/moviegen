import { useCallback, useEffect, useState } from 'react';
import type { AppSettingsDTO } from '@mediagen/types';
import { api, ApiClientError } from '@/api/client';

export interface UseSettingsResult {
  settings: AppSettingsDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: { openrouterApiKey?: string | null; parseModel?: string | null; ttsModel?: string | null }) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await api.settings.get());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const update = useCallback(async (patch: { openrouterApiKey?: string | null; parseModel?: string | null; ttsModel?: string | null }) => {
    const updated = await api.settings.update(patch);
    setSettings(updated);
  }, []);

  return { settings, loading, error, reload, update };
}
