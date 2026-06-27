import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Copy,
  Expand,
  Image as ImageIcon,
  Loader2,
  PlayCircle,
  Save,
  SkipForward,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import type { SpendDTO } from '@mediagen/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUsd, spendLabel } from '@/lib/cost';
import {
  blobToFile,
  imageFromDataTransfer,
  orderStudioItems,
  type StudioCandidate,
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
  /** Accumulated LLM spend for this project (header + API-panel display). */
  spend?: SpendDTO | null;
  /** Re-fetch the project spend (called after each API generation). */
  fetchSpend?: () => Promise<SpendDTO>;
  /** Image-generation model ids (from Settings) the user can pick for API mode. */
  imageModels?: string[];
  /** Video-generation model ids (from Settings) the user can pick for API mode. */
  videoModels?: string[];
  /**
   * Embedded mode: a single-item generation workbench (used inside the
   * GenerateModal). Hides the queue rail, scope selector and queue navigation.
   */
  embedded?: boolean;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 30));

export function Estudio({
  items: rawItems,
  onRefresh,
  emptyHint,
  initialFocusKey,
  spend: spendProp,
  fetchSpend,
  imageModels = [],
  videoModels = [],
  embedded = false,
}: EstudioProps) {
  // Optimistic overlay: skip/reorder apply instantly to a local copy (sub-100ms
  // feedback) while the server write + queue refresh land in the background.
  const [optimistic, setOptimistic] = useState<Record<string, { skipped?: boolean; queuePriority?: number }>>({});
  const overlaidItems = useMemo(
    () => rawItems.map((it) => (optimistic[it.key] ? { ...it, ...optimistic[it.key] } : it)),
    [rawItems, optimistic],
  );
  const allItems = useMemo(() => orderStudioItems(overlaidItems), [overlaidItems]);

  // Sequence groups (scenes/pranchas) so a long queue can be produced one at a
  // time. References (no group) are always shown alongside the chosen group.
  const groups = useMemo(() => {
    const byId = new Map<string, NonNullable<StudioItem['group']>>();
    for (const it of allItems) if (it.group) byId.set(it.group.id, it.group);
    return [...byId.values()].sort((a, b) => a.order - b.order);
  }, [allItems]);
  const groupNoun = allItems.some((i) => i.kind === 'quadro')
    ? 'Prancha'
    : allItems.some((i) => i.kind === 'shot')
      ? 'Cena'
      : 'Grupo';

  const [scopeId, setScopeId] = useState<string | null>(null);
  const focusGroupId = initialFocusKey
    ? allItems.find((i) => i.key === initialFocusKey)?.group?.id
    : undefined;
  const scope = scopeId ?? focusGroupId ?? groups[0]?.id ?? 'all';

  const items = useMemo(
    () => allItems.filter((i) => !i.group || scope === 'all' || i.group.id === scope),
    [allItems, scope],
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [focusKey, setFocusKey] = useState<string | null>(initialFocusKey ?? null);
  useEffect(() => {
    if (initialFocusKey) {
      setFocusKey(initialFocusKey);
      setScopeId(null);
    }
  }, [initialFocusKey]);

  const [prompt, setPrompt] = useState<string>('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptDirty, setPromptDirty] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [improving, setImproving] = useState(false);
  // The prompt build failed (server hiccup). Block generate/save until edited so
  // the "(falha ao montar o prompt: …)" placeholder is never sent or persisted.
  const [promptFailed, setPromptFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false); // upload/select/delete in flight (non-blocking visually)
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // ─── Spend mirror ───────────────────────────────────────────────────────────
  const [spend, setSpend] = useState<SpendDTO | null>(spendProp ?? null);
  const [lastItemCost, setLastItemCost] = useState<number | null>(null);
  const spendRef = useRef<SpendDTO | null>(spend);
  useEffect(() => setSpend(spendProp ?? null), [spendProp]);
  useEffect(() => {
    spendRef.current = spend;
  }, [spend]);
  const refreshSpend = useCallback(async (): Promise<SpendDTO | null> => {
    if (!fetchSpend) return spendRef.current;
    try {
      const next = await fetchSpend();
      spendRef.current = next;
      setSpend(next);
      return next;
    } catch {
      return spendRef.current;
    }
  }, [fetchSpend]);

  // ─── Model selection ──────────────────────────────────────────────────────────
  const [imageModel, setImageModel] = useState<string>(imageModels[0] ?? '');
  const imageModelRef = useRef(imageModel);
  useEffect(() => {
    imageModelRef.current = imageModel;
  }, [imageModel]);
  const [videoModel, setVideoModel] = useState<string>(videoModels[0] ?? '');
  const videoModelRef = useRef(videoModel);
  useEffect(() => {
    videoModelRef.current = videoModel;
  }, [videoModel]);
  useEffect(() => {
    setImageModel((cur) => (cur && imageModels.includes(cur) ? cur : imageModels[0] ?? ''));
  }, [imageModels]);
  useEffect(() => {
    setVideoModel((cur) => (cur && videoModels.includes(cur) ? cur : videoModels[0] ?? ''));
  }, [videoModels]);

  // Resolve the focused item; default to the first active (pending, not skipped).
  const current = useMemo(() => {
    if (focusKey) {
      const f = items.find((i) => i.key === focusKey);
      if (f) return f;
    }
    return (
      items.find((i) => !i.done && !i.skipped) ?? items.find((i) => !i.done) ?? items[0] ?? null
    );
  }, [items, focusKey]);

  const currentIsVideo = current?.accepts === 'video';
  const activeModel = currentIsVideo ? videoModel : imageModel;
  const modelMissing = currentIsVideo ? videoModels.length === 0 : imageModels.length === 0;
  const doneCount = items.filter((i) => i.done).length;
  const skippedCount = items.filter((i) => !i.done && i.skipped).length;
  const pendingCount = items.length - doneCount - skippedCount;

  // Reorder bounds within the active kind group.
  const moveGroup = current
    ? items.filter((i) => i.kind === current.kind && !i.done && !i.skipped)
    : [];
  const movePos = current ? moveGroup.findIndex((i) => i.key === current.key) : -1;
  const canMoveUp = movePos > 0;
  const canMoveDown = movePos >= 0 && movePos < moveGroup.length - 1;

  // ─── Candidates (per-item gallery) ────────────────────────────────────────────
  const [candidates, setCandidates] = useState<StudioCandidate[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  // A failed candidate listing must read as an error, not as "no candidates yet"
  // — otherwise a successful paid generation can look like it produced nothing.
  const [candError, setCandError] = useState<string | null>(null);
  // Local optimistic selection so a click highlights instantly (<200ms), before
  // the server round-trip + queue refresh land.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Synchronous re-entrancy guards: state-based disables only apply after a
  // re-render, so a fast double-click would otherwise fire two paid jobs.
  const generatingRef = useRef(false);
  const improvingRef = useRef(false);

  const reloadCandidates = useCallback(async (item: StudioItem | null) => {
    if (!item?.listCandidates) {
      setCandidates([]);
      setCandError(null);
      return;
    }
    setCandLoading(true);
    setCandError(null);
    try {
      const list = await item.listCandidates();
      list.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      setCandidates(list);
    } catch (e) {
      setCandError(String(e instanceof Error ? e.message : e));
    } finally {
      setCandLoading(false);
    }
  }, []);

  // Switching item: reload its candidates and sync the selection from the queue.
  // Clear first so the gallery never flashes the previous item's candidates.
  const currentKey = current?.key ?? null;
  useEffect(() => {
    setSelectedId(current?.selectedCandidateId ?? null);
    setCandidates([]);
    void reloadCandidates(current ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);
  // Reconcile the selection when the queue refresh reports a new chosen result.
  useEffect(() => {
    setSelectedId(current?.selectedCandidateId ?? null);
  }, [current?.selectedCandidateId]);

  // Keep the active chip centered in the sticky nav rail as you move between items.
  const activeChipRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentKey]);

  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? null;
  // Instant preview on item switch: the queue already knows the selected result's
  // thumbnail (images), so show it before the candidate list round-trip lands.
  const preview = selectedCandidate
    ? { url: selectedCandidate.url, accepts: selectedCandidate.accepts }
    : current?.done && current.thumbnailUrl
      ? { url: current.thumbnailUrl, accepts: current.accepts }
      : null;

  // ─── Prompt loading ───────────────────────────────────────────────────────────
  // Keyed on currentKey, not the whole `current` object: a background refresh
  // rebuilds `current` with the same key, and re-running this would discard the
  // user's unsaved prompt edits. Only an actual item switch should reload.
  useEffect(() => {
    if (!current) {
      setPrompt('');
      setPromptFailed(false);
      return;
    }
    let alive = true;
    setPromptLoading(true);
    setPromptDirty(false);
    setPromptSaved(false);
    setPromptFailed(false);
    void current
      .getPrompt()
      .then((p) => alive && setPrompt(p))
      .catch((e) => {
        if (!alive) return;
        setPrompt(`(falha ao montar o prompt: ${String(e instanceof Error ? e.message : e)})`);
        setPromptFailed(true);
      })
      .finally(() => alive && setPromptLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  // ─── Navigation (pure local → instant) ────────────────────────────────────────
  const advance = useCallback(() => {
    const list = itemsRef.current;
    const idx = current ? list.findIndex((i) => i.key === current.key) : -1;
    const active = (i: StudioItem) => !i.done && !i.skipped;
    const next =
      list.slice(idx + 1).find(active) ?? list.find((i) => active(i) && i.key !== current?.key);
    if (next) setFocusKey(next.key);
  }, [current]);

  const goPrev = useCallback(() => {
    const list = itemsRef.current;
    const idx = current ? list.findIndex((i) => i.key === current.key) : 0;
    const prev = list[Math.max(0, idx - 1)];
    if (prev) setFocusKey(prev.key);
  }, [current]);

  const goNext = useCallback(() => {
    const list = itemsRef.current;
    const idx = current ? list.findIndex((i) => i.key === current.key) : -1;
    const nxt = list[Math.min(list.length - 1, idx + 1)];
    if (nxt) setFocusKey(nxt.key);
  }, [current]);

  // ─── Fullscreen viewer ────────────────────────────────────────────────────────
  const [viewer, setViewer] = useState<{ url: string; accepts: 'image' | 'video'; label: string } | null>(null);

  // ─── Upload (manual: auto-selects on the server) ──────────────────────────────
  const submitFile = useCallback(
    async (file: File) => {
      if (!current) return;
      setBusy(true);
      setError(null);
      try {
        await current.submit(file);
        await onRefresh();
        await tick();
        await reloadCandidates(itemsRef.current.find((i) => i.key === current.key) ?? current);
        setSessionCount((c) => c + 1);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [current, onRefresh, reloadCandidates],
  );

  const copyPrompt = useCallback(() => {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [prompt]);

  const savePromptNow = useCallback(async () => {
    if (!current?.savePrompt) return;
    setSavingPrompt(true);
    setError(null);
    try {
      await current.savePrompt(prompt);
      setPromptDirty(false);
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 1500);
      await onRefresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSavingPrompt(false);
    }
  }, [current, prompt, onRefresh]);

  const improvePromptNow = useCallback(async () => {
    if (!current?.improvePrompt || improving || improvingRef.current) return;
    improvingRef.current = true;
    setImproving(true);
    setError(null);
    try {
      const txt = await current.improvePrompt();
      setPrompt(txt);
      setPromptDirty(false); // the endpoint persists it
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 1500);
      await onRefresh();
      await refreshSpend();
    } catch (e) {
      setError(`Não foi possível melhorar o prompt: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setImproving(false);
      improvingRef.current = false;
    }
  }, [current, improving, onRefresh, refreshSpend]);

  // ─── API generation (per-item, no auto-advance, no auto-select) ───────────────
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    setGenElapsed(0);
    const id = setInterval(() => setGenElapsed(Math.round((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [generating]);

  const generate = useCallback(async () => {
    if (!current?.apiGenerate || generating || generatingRef.current) return;
    if (promptFailed) {
      setError('O prompt não pôde ser montado. Edite o texto antes de gerar.');
      return;
    }
    if (spendRef.current?.capReached) {
      const cap = spendRef.current.capUsd;
      setError(
        `Teto de gasto atingido${cap != null ? ` (US$ ${cap.toFixed(2)})` : ''}. ` +
          'Ajuste o teto em Configurações para gerar mais.',
      );
      return;
    }
    generatingRef.current = true;
    setGenerating(true);
    setError(null);
    const before = spendRef.current?.totalUsd ?? 0;
    const target = current;
    const promptText = prompt;
    try {
      const model = (target.accepts === 'video' ? videoModelRef.current : imageModelRef.current) || undefined;
      // Persist the edited prompt so the box stays stable after refresh (references).
      if (target.promptEditable && target.savePrompt) {
        try {
          await target.savePrompt(promptText);
        } catch {
          /* non-fatal: still generate with the on-screen prompt */
        }
      }
      const res = await target.apiGenerate!({ model, prompt: promptText });
      if (res && 'jobId' in res && target.followJob) await target.followJob(res.jobId);
      setSessionCount((c) => c + 1);
      await onRefresh();
      await reloadCandidates(itemsRef.current.find((i) => i.key === target.key) ?? target);
      const after = await refreshSpend();
      setLastItemCost(after?.hasCost && after.totalUsd > before ? after.totalUsd - before : null);
    } catch (e) {
      setError(`Geração falhou: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  }, [current, generating, promptFailed, onRefresh, reloadCandidates, refreshSpend, prompt]);

  // ─── Candidate choose/delete (optimistic → instant) ───────────────────────────
  const chooseCandidate = useCallback(
    (id: string) => {
      if (!current?.selectCandidate) return;
      const prev = selectedId;
      setSelectedId(id); // instant highlight
      const target = current;
      void (async () => {
        try {
          await target.selectCandidate!(id);
          await onRefresh();
        } catch (e) {
          setError(String(e instanceof Error ? e.message : e));
          // The server didn't change selection — don't keep lying about which is in use.
          setSelectedId(prev);
          void reloadCandidates(itemsRef.current.find((i) => i.key === target.key) ?? target);
        }
      })();
    },
    [current, selectedId, onRefresh, reloadCandidates],
  );

  const removeCandidate = useCallback(
    (id: string) => {
      if (!current?.deleteCandidate) return;
      setCandidates((prev) => prev.filter((c) => c.id !== id)); // instant removal
      setSelectedId((cur) => (cur === id ? null : cur));
      const target = current;
      void (async () => {
        try {
          await target.deleteCandidate!(id);
          await onRefresh();
          await reloadCandidates(itemsRef.current.find((i) => i.key === target.key) ?? target);
        } catch (e) {
          setError(String(e instanceof Error ? e.message : e));
          void reloadCandidates(target);
        }
      })();
    },
    [current, onRefresh, reloadCandidates],
  );

  // ─── Skip / reorder (optimistic → instant, persist in background) ─────────────
  const clearOptimistic = useCallback((keys: string[]) => {
    setOptimistic((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }, []);

  const toggleSkip = useCallback(() => {
    if (!current) return;
    const key = current.key;
    const wasSkipped = current.skipped;
    setError(null);
    setOptimistic((prev) => ({ ...prev, [key]: { ...prev[key], skipped: !wasSkipped } }));
    if (!wasSkipped) advance(); // jump immediately
    void (async () => {
      try {
        await current.setSkipped(!wasSkipped);
        await onRefresh();
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
        // We advanced optimistically; the skip didn't persist, so come back to it.
        if (!wasSkipped) setFocusKey(key);
      } finally {
        clearOptimistic([key]);
      }
    })();
  }, [current, onRefresh, advance, clearOptimistic]);

  const move = useCallback(
    (dir: -1 | 1) => {
      if (!current) return;
      const list = itemsRef.current;
      const group = list.filter((i) => i.kind === current.kind && !i.done && !i.skipped);
      const pos = group.findIndex((i) => i.key === current.key);
      const neighbor = group[pos + dir];
      if (pos < 0 || !neighbor) return;
      const eff = (i: StudioItem) => i.queuePriority ?? list.findIndex((x) => x.key === i.key);
      const a = eff(current);
      const b = eff(neighbor);
      setError(null);
      // Instant swap in the local overlay; persist both in the background.
      setOptimistic((prev) => ({
        ...prev,
        [current.key]: { ...prev[current.key], queuePriority: b },
        [neighbor.key]: { ...prev[neighbor.key], queuePriority: a },
      }));
      void (async () => {
        try {
          await current.setPriority(b);
          await neighbor.setPriority(a);
        } catch (e) {
          setError(String(e instanceof Error ? e.message : e));
        } finally {
          // Always reconcile with server truth: a partial swap (first write ok,
          // second failed) must not be hidden by clearing the overlay onto stale order.
          await onRefresh();
          clearOptimistic([current.key, neighbor.key]);
        }
      })();
    },
    [current, onRefresh, clearOptimistic],
  );

  // ─── Global paste → upload candidate (image items, manual mode) ───────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (generating || busy || !current || current.accepts !== 'image') return;
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
  }, [generating, busy, current, submitFile]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewer && e.key === 'Escape') {
        setViewer(null);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key.toLowerCase() === 'c') copyPrompt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, goNext, goPrev, copyPrompt]);

  if (allItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyHint ?? 'Nada para produzir ainda. Carregue e parseie um roteiro primeiro.'}
      </div>
    );
  }

  const progressPct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const canGenerate = Boolean(current?.apiGenerate) && !modelMissing;
  const acceptsLabel = current?.accepts === 'video' ? 'vídeo' : 'imagem';

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold">{current?.label ?? '—'}</span>
            {current?.sublabel && (
              <span className="truncate text-sm text-muted-foreground">· {current.sublabel}</span>
            )}
            {current && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  current.done
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : current.skipped
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                )}
              >
                {current.done ? 'escolhido' : current.skipped ? 'pulado' : 'pendente'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {!embedded && (
              <>
                {doneCount}/{items.length} prontos · {pendingCount} na fila
                {skippedCount > 0 && ` · ${skippedCount} pulados`}
                {sessionCount > 0 && ` · ${sessionCount} gerados na sessão`}
                {' · '}
              </>
            )}
            custo IA: {spendLabel(spend)}
            {spend?.capUsd != null && ` / $${spend.capUsd.toFixed(2)}`}
            {lastItemCost != null && ` · último: ${formatUsd(lastItemCost)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {current?.apiGenerate && !modelMissing && (
            <select
              value={activeModel}
              onChange={(e) => (currentIsVideo ? setVideoModel(e.target.value) : setImageModel(e.target.value))}
              title={`Modelo de ${acceptsLabel} (gateway)`}
              disabled={generating}
              className="h-9 max-w-[15rem] rounded-md border bg-background px-2 text-sm disabled:opacity-50"
            >
              {(currentIsVideo ? videoModels : imageModels).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {current?.apiGenerate && (
            <Button
              onClick={() => void generate()}
              disabled={generating || modelMissing}
              className="gap-1.5"
              title={
                modelMissing ? `Configure um modelo de ${acceptsLabel} em Configurações` : undefined
              }
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? `Gerando… ${genElapsed}s` : 'Gerar'}
            </Button>
          )}
        </div>
      </div>

      {/* ─── Sticky navigation: stays above the fold while you scroll candidates ── */}
      {!embedded && current && (
        <div className="sticky top-0 z-20 -mx-1 space-y-2 border-b bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={goPrev} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">
              {Math.max(0, items.findIndex((i) => i.key === current.key)) + 1} / {items.length}
            </span>
            <Button variant="ghost" size="sm" onClick={goNext} className="gap-1">
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            {current.skipped ? (
              <Button variant="ghost" size="sm" onClick={() => void toggleSkip()} className="gap-1">
                <PlayCircle className="h-4 w-4" /> Retomar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void toggleSkip()} className="gap-1">
                <SkipForward className="h-4 w-4" /> Pular
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              title="Mover antes na fila"
              disabled={!canMoveUp}
              onClick={() => void move(-1)}
              className="h-8 w-8"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Mover depois na fila"
              disabled={!canMoveDown}
              onClick={() => void move(1)}
              className="h-8 w-8"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
          {/* Item rail: single horizontal scroll row so it never grows vertically. */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {items.map((it) => {
              const isCurrent = it.key === current.key;
              return (
                <button
                  key={it.key}
                  ref={isCurrent ? activeChipRef : undefined}
                  type="button"
                  title={`${it.label}${it.sublabel ? ` · ${it.sublabel}` : ''}`}
                  onClick={() => setFocusKey(it.key)}
                  className={cn(
                    'h-7 shrink-0 rounded px-2 text-xs transition-colors',
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : it.done
                        ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400'
                        : it.skipped
                          ? 'bg-muted/50 text-muted-foreground/60 line-through'
                          : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  {it.done ? '●' : it.skipped ? '⤓' : '○'}{' '}
                  {it.label.length > 18 ? it.label.slice(0, 17) + '…' : it.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scope selector */}
      {!embedded && groups.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{groupNoun}:</span>
          <select
            value={scope}
            onChange={(e) => setScopeId(e.target.value)}
            className="h-9 max-w-[20rem] rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">Todas ({groups.length})</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">· referências sempre visíveis</span>
        </div>
      )}

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Main: prompt | result ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* PROMPT */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prompt</h3>
            <div className="flex items-center gap-1">
              {current?.improvePrompt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void improvePromptNow()}
                  disabled={improving || promptLoading}
                  title="Reescreve o prompt com IA: só pistas visuais, identidade física concreta, formato de model sheet"
                  className="gap-1"
                >
                  {improving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Melhorar com IA
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={copyPrompt} className="gap-1">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>
          {current?.promptEditable ? (
            <>
              <textarea
                value={promptLoading ? '' : prompt}
                placeholder={promptLoading ? 'Montando prompt…' : undefined}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setPromptDirty(true);
                  setPromptSaved(false);
                  setPromptFailed(false);
                }}
                disabled={promptLoading || improving}
                spellCheck={false}
                className="max-h-[460px] min-h-[260px] flex-1 resize-y rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
              />
              {current?.savePrompt && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void savePromptNow()}
                    disabled={!promptDirty || savingPrompt}
                    className="gap-1"
                  >
                    {savingPrompt ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : promptSaved ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {promptSaved ? 'Salvo' : 'Salvar prompt'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Editável — é exatamente este texto que será enviado.
                  </span>
                </div>
              )}
            </>
          ) : (
            <pre className="max-h-[420px] flex-1 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              {promptLoading ? 'Montando prompt…' : prompt}
            </pre>
          )}
          {current && current.getAttachments().length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                Anexe também estas referências:
              </h4>
              <div className="flex flex-wrap gap-2">
                {current.getAttachments().map((a) => (
                  <button
                    key={a.url}
                    type="button"
                    onClick={() => setViewer({ url: a.url, accepts: 'image', label: a.label })}
                    title={`${a.label} (clique para ampliar)`}
                    className="block h-16 w-16 overflow-hidden rounded border hover:ring-2 hover:ring-primary"
                  >
                    <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RESULT */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resultado escolhido
          </h3>
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
              'group relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            )}
          >
            {generating ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-9 w-9 animate-spin text-primary" />
                <div>
                  <p className="font-medium text-foreground">Gerando {acceptsLabel}…</p>
                  <p className="text-xs">
                    {activeModel} · {genElapsed}s
                  </p>
                </div>
              </div>
            ) : busy ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-9 w-9 animate-spin text-primary" />
                <p className="font-medium text-foreground">Enviando arquivo…</p>
              </div>
            ) : preview ? (
              <>
                {preview.accepts === 'video' ? (
                  <video src={preview.url} controls className="max-h-[360px] w-full rounded object-contain" />
                ) : (
                  <img
                    src={preview.url}
                    alt={current?.label}
                    className="max-h-[360px] w-auto rounded object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() =>
                    setViewer({ url: preview.url, accepts: preview.accepts, label: current?.label ?? '' })
                  }
                  title="Ver em tela cheia"
                  className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-background group-hover:opacity-100"
                >
                  <Expand className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                {current?.accepts === 'image' ? (
                  <Clipboard className="h-9 w-9" />
                ) : (
                  <Video className="h-9 w-9" />
                )}
                <p className="max-w-[18rem]">
                  {candidates.length > 0
                    ? 'Nenhum candidato escolhido ainda. Escolha um abaixo.'
                    : current?.accepts === 'image'
                      ? 'Gere com a IA, cole (Ctrl/Cmd-V) ou arraste uma imagem aqui.'
                      : 'Gere com a IA ou arraste um arquivo de vídeo aqui.'}
                </p>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  className="gap-1"
                >
                  {current?.accepts === 'video' ? (
                    <Upload className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  Enviar arquivo
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Candidate gallery ──────────────────────────────────────────────── */}
      {current?.listCandidates && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Candidatos {candidates.length > 0 && `(${candidates.length})`}
            </h3>
            <span className="text-xs text-muted-foreground">
              Gere quantos quiser; nada é descartado. Escolha um para usar.
            </span>
          </div>
          {candLoading && candidates.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando candidatos…
            </div>
          ) : candError ? (
            <p className="rounded-lg border border-dashed border-destructive/40 py-6 text-center text-sm text-destructive">
              Não foi possível carregar os candidatos: {candError}
            </p>
          ) : candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              Nenhum candidato ainda. Clique em <span className="font-medium">Gerar</span> ou envie um arquivo.
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {candidates.map((c) => {
                const chosen = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'group relative w-40 shrink-0 overflow-hidden rounded-lg border bg-card transition-shadow',
                      chosen ? 'ring-2 ring-primary' : 'hover:shadow-md',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setViewer({ url: c.url, accepts: c.accepts, label: current.label })}
                      title="Ver em tela cheia"
                      className="block aspect-square w-full bg-muted"
                    >
                      {c.accepts === 'video' ? (
                        <video src={c.url} muted className="h-full w-full object-cover" />
                      ) : (
                        <img src={c.url} alt="" className="h-full w-full object-cover" />
                      )}
                    </button>

                    {/* badges */}
                    <div className="pointer-events-none absolute left-1.5 top-1.5 flex gap-1">
                      {chosen && (
                        <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          em uso
                        </span>
                      )}
                      <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
                        {c.source === 'generated' ? 'IA' : 'upload'}
                      </span>
                    </div>

                    {/* hover actions */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {chosen ? (
                        <span className="flex flex-1 items-center justify-center gap-1 rounded bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground">
                          <Check className="h-3 w-3" /> Em uso
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => chooseCandidate(c.id)}
                          className="flex-1 rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-black hover:bg-white"
                        >
                          Usar esta
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeCandidate(c.id)}
                        title="Excluir candidato"
                        className="rounded bg-white/90 p-1 text-destructive hover:bg-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {c.model && (
                      <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground" title={c.model}>
                        {c.model}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Fullscreen viewer ──────────────────────────────────────────────── */}
      {viewer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setViewer(null)}
        >
          <button
            onClick={() => setViewer(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            title="Fechar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex max-h-full max-w-6xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {viewer.accepts === 'video' ? (
              <video src={viewer.url} controls autoPlay className="max-h-[85vh] w-auto rounded-lg" />
            ) : (
              <img src={viewer.url} alt={viewer.label} className="max-h-[85vh] w-auto rounded-lg" />
            )}
            {viewer.label && <p className="text-sm text-white/80">{viewer.label}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default Estudio;
