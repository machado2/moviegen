import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clipboard,
  Copy,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  SkipForward,
  Square,
  Upload,
  Video,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  blobToFile,
  imageFromDataTransfer,
  orderStudioItems,
  type StudioItem,
} from '@/lib/studio';

export interface EstudioProps {
  items: StudioItem[];
  /** Re-fetch project data after a result is saved. May be async. */
  onRefresh: () => void | Promise<void>;
  /** Label of the medium, e.g. "Filme" / "HQ". */
  emptyHint?: string;
  /** When set, the loop opens on this item (e.g. jumped from the Storyboard). */
  initialFocusKey?: string;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 60));

export function Estudio({ items: rawItems, onRefresh, emptyHint, initialFocusKey }: EstudioProps) {
  const items = useMemo(() => orderStudioItems(rawItems), [rawItems]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [focusKey, setFocusKey] = useState<string | null>(initialFocusKey ?? null);
  // Honor an externally-requested focus (e.g. "produzir este" from the Storyboard).
  useEffect(() => {
    if (initialFocusKey) setFocusKey(initialFocusKey);
  }, [initialFocusKey]);
  const [prompt, setPrompt] = useState<string>('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [last, setLast] = useState<{ url: string; label: string } | null>(null);
  const [review, setReview] = useState<{ url: string; label: string; key?: string } | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // API mode
  const [apiRunning, setApiRunning] = useState(false);
  const [rateSec, setRateSec] = useState(60);
  const [countdown, setCountdown] = useState(0);
  const stopRef = useRef(false);
  const rateRef = useRef(60);
  useEffect(() => {
    rateRef.current = rateSec;
  }, [rateSec]);

  // Resolve the focused item; default to the first pending one.
  const current = useMemo(() => {
    if (focusKey) {
      const f = items.find((i) => i.key === focusKey);
      if (f) return f;
    }
    return items.find((i) => !i.done) ?? items[0] ?? null;
  }, [items, focusKey]);

  const pendingCount = items.filter((i) => !i.done).length;
  const doneCount = items.length - pendingCount;
  const apiCapable = items.some((i) => !i.done && i.apiGenerate);

  // Load the current item's prompt whenever it changes.
  useEffect(() => {
    if (!current) {
      setPrompt('');
      return;
    }
    let alive = true;
    setPromptLoading(true);
    void current
      .getPrompt()
      .then((p) => {
        if (alive) setPrompt(p);
      })
      .catch((e) => {
        if (alive) setPrompt(`(falha ao montar o prompt: ${String(e instanceof Error ? e.message : e)})`);
      })
      .finally(() => {
        if (alive) setPromptLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [current]);

  const advance = useCallback(() => {
    const list = itemsRef.current;
    const idx = current ? list.findIndex((i) => i.key === current.key) : -1;
    const next = list.slice(idx + 1).find((i) => !i.done) ?? list.find((i) => !i.done && i.key !== current?.key);
    if (next) setFocusKey(next.key);
  }, [current]);

  const submitFile = useCallback(
    async (file: File) => {
      if (!current) return;
      setBusy(true);
      setError(null);
      try {
        await current.submit(file);
        const url = URL.createObjectURL(file);
        setLast({ url, label: current.label });
        await onRefresh();
        await tick();
        advance();
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [current, onRefresh, advance],
  );

  const copyPrompt = useCallback(() => {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [prompt]);

  // Global paste → advance (image items only, manual mode).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (apiRunning || busy || !current || current.accepts !== 'image') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const blob = imageFromDataTransfer(e.clipboardData?.items ?? null);
      if (blob) {
        e.preventDefault();
        void submitFile(blobToFile(blob, current.key));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [apiRunning, busy, current, submitFile]);

  // Keyboard shortcuts for the loop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (apiRunning) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') advance();
      else if (e.key === 'ArrowLeft') {
        const list = itemsRef.current;
        const idx = current ? list.findIndex((i) => i.key === current.key) : 0;
        const prev = list[Math.max(0, idx - 1)];
        if (prev) setFocusKey(prev.key);
      } else if (e.key.toLowerCase() === 'c') copyPrompt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apiRunning, advance, current, copyPrompt]);

  // ─── API generation loop ──────────────────────────────────────────────────
  const waitRate = useCallback(async (secs: number) => {
    for (let s = secs; s > 0; s--) {
      if (stopRef.current) return;
      setCountdown(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(0);
  }, []);

  const runApi = useCallback(async () => {
    stopRef.current = false;
    setApiRunning(true);
    setError(null);
    try {
      let first = true;
      while (!stopRef.current) {
        const next = itemsRef.current.find((i) => !i.done && i.apiGenerate);
        if (!next) break;
        if (!first) await waitRate(rateRef.current);
        if (stopRef.current) break;
        first = false;
        setFocusKey(next.key);
        setBusy(true);
        try {
          const res = await next.apiGenerate!();
          if (res && 'jobId' in res && next.followJob) await next.followJob(res.jobId);
          setSessionCount((c) => c + 1);
        } catch (e) {
          setError(`Geração interrompida: ${String(e instanceof Error ? e.message : e)}`);
          stopRef.current = true;
        } finally {
          setBusy(false);
        }
        await onRefresh();
        await tick();
      }
    } finally {
      setApiRunning(false);
      setCountdown(0);
    }
  }, [onRefresh, waitRate]);

  const stopApi = useCallback(() => {
    stopRef.current = true;
    setApiRunning(false);
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyHint ?? 'Nada para produzir ainda. Carregue e parseie um roteiro primeiro.'}
      </div>
    );
  }

  const progressPct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header: progress + API toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{current?.label ?? '—'}</span>
            {current?.sublabel && <span className="text-muted-foreground">· {current.sublabel}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {doneCount}/{items.length} prontos · {pendingCount} na fila
            {sessionCount > 0 && ` · ${sessionCount} gerados nesta sessão`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!apiRunning && apiCapable && (
            <Button onClick={() => void runApi()} className="gap-1">
              <Zap className="h-4 w-4" /> Gerar com API
            </Button>
          )}
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Main two-column: prompt | result */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* PROMPT */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prompt</h3>
            <Button variant="outline" size="sm" onClick={copyPrompt} className="gap-1">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar prompt'}
            </Button>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
            {promptLoading ? 'Montando prompt…' : prompt}
          </pre>
          {current && current.getAttachments().length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                Anexe também estas referências:
              </h4>
              <div className="flex flex-wrap gap-2">
                {current.getAttachments().map((a) => (
                  <a
                    key={a.url}
                    href={a.url}
                    download
                    title={`${a.label} (clique para baixar)`}
                    className="block h-16 w-16 overflow-hidden rounded border hover:ring-2 hover:ring-primary"
                  >
                    <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RESULT */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado</h3>

          {apiRunning ? (
            <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando: {current?.label}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Limite de taxa:</span>
                <Input
                  type="number"
                  min={5}
                  value={rateSec}
                  onChange={(e) => setRateSec(Math.max(5, Number(e.target.value) || 60))}
                  className="h-8 w-20"
                />
                <span className="text-muted-foreground">s</span>
                {countdown > 0 && <span className="text-muted-foreground">· próximo em {countdown}s</span>}
              </div>
              <Button variant="destructive" size="lg" onClick={stopApi} className="w-full gap-2">
                <Square className="h-5 w-5" /> PARAR GERAÇÃO
              </Button>
              <p className="text-xs text-muted-foreground">
                Gera um por vez, com limite forte, para você perceber um erro antes de gastar demais.
              </p>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!current) return;
                if (current.accepts === 'image') {
                  const blob = imageFromDataTransfer(e.dataTransfer.items);
                  if (blob) void submitFile(blobToFile(blob, current.key));
                } else {
                  const f = e.dataTransfer.files?.[0];
                  if (f) void submitFile(f);
                }
              }}
              className={cn(
                'flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6 text-center text-sm',
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30',
              )}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : current?.done && current.thumbnailUrl ? (
                <>
                  <img src={current.thumbnailUrl} alt={current.label} className="max-h-40 rounded" />
                  <p className="text-muted-foreground">
                    Já gerado. {current.accepts === 'image' ? 'Cole/arraste' : 'Envie um arquivo'} para substituir.
                  </p>
                </>
              ) : current?.done ? (
                <>
                  <Check className="h-8 w-8 text-emerald-500" />
                  <p className="text-muted-foreground">
                    Já gerado. {current.accepts === 'image' ? 'Cole/arraste' : 'Envie um arquivo'} para substituir.
                  </p>
                </>
              ) : current?.accepts === 'image' ? (
                <>
                  <Clipboard className="h-8 w-8 text-muted-foreground" />
                  <p>
                    Cole uma imagem (Ctrl/Cmd-V) ou arraste aqui.
                    <br />
                    Ao colar, salva e avança para o próximo.
                  </p>
                </>
              ) : (
                <>
                  <Video className="h-8 w-8 text-muted-foreground" />
                  <p>Arraste um arquivo de vídeo aqui ou envie abaixo.</p>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={current?.accepts === 'video' ? 'video/*' : 'image/*'}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void submitFile(f);
                  e.target.value = '';
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} className="gap-1">
                {current?.accepts === 'video' ? <Upload className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                Enviar arquivo
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* manual nav */}
          {!apiRunning && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={advance} className="gap-1">
                <SkipForward className="h-4 w-4" /> Pular
              </Button>
              {current && (
                <Button variant="ghost" size="sm" onClick={() => setFocusKey(current.key)} className="gap-1">
                  <RotateCcw className="h-4 w-4" /> Refazer este
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Queue rail */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fila</h4>
        <div className="flex flex-wrap gap-1">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              title={`${it.label}${it.sublabel ? ` · ${it.sublabel}` : ''}`}
              onClick={() => setFocusKey(it.key)}
              className={cn(
                'h-7 rounded px-2 text-xs',
                it.key === current?.key
                  ? 'bg-primary text-primary-foreground'
                  : it.done
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {it.done ? '●' : '○'} {it.label.length > 16 ? it.label.slice(0, 15) + '…' : it.label}
            </button>
          ))}
        </div>
      </div>

      {/* Last-pasted corner */}
      {last && (
        <button
          type="button"
          onClick={() => setReview({ ...last })}
          title="Último colado — clique para revisar"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur hover:ring-2 hover:ring-primary"
        >
          <img src={last.url} alt={last.label} className="h-12 w-12 rounded object-cover" />
          <span className="max-w-[120px] truncate pr-1 text-xs">{last.label}</span>
        </button>
      )}

      {/* Review overlay */}
      {review && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setReview(null)}
        >
          <div className="max-h-full max-w-2xl overflow-auto rounded-lg bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-medium">{review.label}</p>
            <img src={review.url} alt={review.label} className="max-h-[70vh] w-auto rounded" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReview(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Estudio;
