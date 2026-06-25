import { useCallback, useEffect, useRef, useState } from 'react';
import { History as HistoryIcon, RotateCcw } from 'lucide-react';
import type { HistoryEntry } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface HistoryProps {
  /** Fetch the commit log, newest first. */
  load: () => Promise<HistoryEntry[]>;
  /** Restore the project to a commit hash. */
  restore: (hash: string) => Promise<unknown>;
  /** Called after a successful restore so the rest of the UI can refresh. */
  onRestored?: () => void;
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
}

export function History({ load, restore, onRestored }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Keep the latest callbacks in refs so a new `load`/`restore` identity on every
  // parent render doesn't retrigger the fetch effect (which would loop forever).
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(() => {
    setError(null);
    void loadRef
      .current()
      .then(setEntries)
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doRestore = async (hash: string) => {
    if (!window.confirm('Restaurar o projeto para esta versão? Isso é registrado como uma nova versão (reversível).')) {
      return;
    }
    setBusy(hash);
    setError(null);
    try {
      await restore(hash);
      onRestored?.();
      refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="h-5 w-5" /> Histórico de versões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {entries === null && !error && <p className="text-sm text-muted-foreground">Carregando histórico…</p>}
        {entries !== null && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma versão registrada ainda. Cada alteração significativa vira uma versão automaticamente.
          </p>
        )}
        {entries?.map((e, i) => (
          <div
            key={e.hash}
            className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{e.message || '(sem mensagem)'}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{e.shortHash}</span> · {relativeTime(e.date)}
                {i === 0 && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">atual</span>}
              </p>
            </div>
            {i !== 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void doRestore(e.hash)}
                className="shrink-0 gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {busy === e.hash ? 'Restaurando…' : 'Restaurar'}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default History;
