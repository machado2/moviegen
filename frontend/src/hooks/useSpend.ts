import { useCallback, useEffect, useState } from 'react';
import type { SpendDTO } from '@mediagen/types';

export interface UseSpendResult {
  spend: SpendDTO | null;
  reload: () => Promise<void>;
}

/**
 * Tracks a project's accumulated LLM spend. Medium-agnostic: the caller passes
 * the right client fetcher (film or comics). Failures are swallowed — a missing
 * cost figure must never break the screen.
 */
export function useSpend(fetcher: () => Promise<SpendDTO>): UseSpendResult {
  const [spend, setSpend] = useState<SpendDTO | null>(null);

  const reload = useCallback(async () => {
    try {
      setSpend(await fetcher());
    } catch {
      /* ignore: spend display is best-effort */
    }
  }, [fetcher]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { spend, reload };
}
