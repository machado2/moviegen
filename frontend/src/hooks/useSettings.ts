import { useCallback, useEffect, useState } from 'react';
import type { AppSettingsDTO } from '@mediagen/types';
import { api, ApiClientError, type SettingsPatch } from '@/api/client';

export interface UseSettingsResult {
  settings: AppSettingsDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<void>;
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

  const update = useCallback(async (patch: SettingsPatch) => {
    const updated = await api.settings.update(patch);
    setSettings(updated);
  }, []);

  return { settings, loading, error, reload, update };
}
