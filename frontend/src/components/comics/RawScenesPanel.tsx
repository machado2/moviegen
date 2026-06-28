import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { ComicsSceneBreakdown, RawScene } from '@mediagen/types';
import { Button } from '@/components/ui/button';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface ComicsRawScenesPanelProps {
  projectId: string;
  onApplied: () => void | Promise<void>;
}

export function ComicsRawScenesPanel({ projectId, onApplied }: ComicsRawScenesPanelProps) {
  const [raw, setRaw] = useState<RawScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [breakdowns, setBreakdowns] = useState<{ list: ComicsSceneBreakdown[]; selectedId: string | null }>({
    list: [],
    selectedId: null,
  });

  const loadRaw = useCallback(async () => {
    setLoading(true);
    try {
      setRaw(await comicsApi.script.rawScenes(projectId));
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadRaw();
  }, [loadRaw]);

  const extract = async () => {
    setExtracting(true);
    setError(null);
    try {
      setRaw(await comicsApi.script.extractRawScenes(projectId));
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  const loadBreakdowns = useCallback(
    async (n: number) => {
      const r = await comicsApi.script.breakdowns(projectId, n);
      setBreakdowns({ list: r.breakdowns, selectedId: r.selectedId });
    },
    [projectId],
  );

  const expand = async (n: number) => {
    setOpen(n);
    setBreakdowns({ list: [], selectedId: null });
    await loadBreakdowns(n);
  };

  const transform = async (n: number) => {
    setBusy(n);
    setError(null);
    try {
      const { jobId } = await comicsApi.script.transformScene(projectId, n);
      await new Promise<void>((resolve, reject) => {
        comicsApi.assembly.subscribeJob(
          projectId,
          jobId,
          (p) => {
            if (p.status === 'done') resolve();
            else if (p.status === 'error') reject(new Error(p.error ?? 'Falha ao transformar'));
          },
          () => reject(new Error('Conexão de progresso perdida. A transformação pode continuar rodando.')),
        );
      });
      await loadBreakdowns(n);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const select = async (n: number, bid: string) => {
    setError(null);
    try {
      await comicsApi.script.selectBreakdown(projectId, n, bid);
      await loadBreakdowns(n);
      await onApplied();
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando cenas cruas…</p>;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Cenas cruas <span className="font-normal text-muted-foreground">· {raw.length}</span>
        </h3>
        <Button variant="outline" size="sm" onClick={() => void extract()} disabled={extracting} className="gap-1">
          {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {raw.length > 0 ? 'Re-extrair' : 'Extrair'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {raw.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Extraia cenas narrativas do roteiro para transformar a HQ cena por cena.
        </p>
      ) : (
        <ul className="divide-y">
          {raw.map((s) => (
            <li key={s.number} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void expand(s.number)}
                  className="min-w-0 flex-1 text-left text-sm hover:underline"
                  title={s.heading}
                >
                  <span className="tabular-nums text-muted-foreground">{s.number}.</span> {s.heading}
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void transform(s.number)}
                  disabled={busy === s.number}
                  className="gap-1"
                >
                  {busy === s.number ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Transformar
                </Button>
              </div>
              {open === s.number && (
                <div className="mt-2 space-y-1 pl-4">
                  {breakdowns.list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum breakdown ainda.</p>
                  ) : (
                    breakdowns.list.map((b) => {
                      const quadroCount = b.pranchas.reduce((sum, p) => sum + p.quadros.length, 0);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">
                            {b.pranchas.length} pranchas · {quadroCount} quadros · {b.model}
                            {breakdowns.selectedId === b.id && ' · em uso'}
                          </span>
                          <Button
                            variant={breakdowns.selectedId === b.id ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => void select(s.number, b.id)}
                          >
                            {breakdowns.selectedId === b.id ? 'Aplicado' : 'Usar'}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ComicsRawScenesPanel;
