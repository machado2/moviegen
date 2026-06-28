import { useEffect, useMemo, useState } from 'react';
import type {
  ComicsProjectDTO,
  PageRender,
  PranchaLayout,
  PranchaRenderMode,
  Quadro,
  QuadroSlotFormat,
  Render,
} from '@mediagen/types';
import { QUADRO_COUNT_BY_LAYOUT } from '@mediagen/types';
import { Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuadroCard } from '@/components/comics/QuadroCard';
import { PranchaGrid } from '@/components/comics/PranchaGrid';
import { PromptPreviewModal } from '@/components/comics/PromptPreviewModal';
import { RenderViewer } from '@/components/comics/RenderViewer';
import { AssemblyProgress } from '@/components/comics/AssemblyProgress';
import { usePranchas, usePrancha } from '@/hooks/comics/usePrancha';
import type { StudioItem } from '@/lib/studio';
import { PRANCHA_LAYOUTS } from '@/lib/comicsLayout';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';
import { cn } from '@/lib/utils';

export interface PranchasProps {
  project: ComicsProjectDTO;
  /** Project production queue, to open a quadro's generation workbench. */
  studioItems?: StudioItem[];
  /** Open the generation modal for a unit. */
  onGenerate?: (item: StudioItem) => void;
}

const SLOT_FORMAT_BY_LAYOUT: Record<PranchaLayout, QuadroSlotFormat> = {
  'rows-1': 'vertical de página inteira, proporção 2:3',
  'rows-2': 'horizontal alto, proporção 4:3',
  'rows-3': 'horizontal panorâmico, proporção 2:1',
  'rows-4': 'horizontal muito panorâmico, proporção 3:1',
  'grid-2x2': 'vertical, proporção 2:3',
  'grid-2x3': 'quadrado, proporção 1:1',
  'grid-2x4': 'quadrado, proporção 1:1',
  'top-then-grid-2x2': 'horizontal panorâmico, proporção 2:1',
};

export function Pranchas({ project, studioItems, onGenerate }: PranchasProps) {
  const projectId = project.id;
  const { pranchas, loading: listLoading, reload: reloadList } =
    usePranchas(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeQuadroId, setActiveQuadroId] = useState<string | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  const [pageGenerating, setPageGenerating] = useState(false);

  // progress map keyed by pranchaId -> quadros with selected render / total
  const [progress, setProgress] = useState<
    Record<string, { done: number; total: number }>
  >({});

  useEffect(() => {
    if (!selectedId && pranchas.length > 0) {
      setSelectedId(pranchas[0]?.id ?? null);
    }
  }, [pranchas, selectedId]);

  const {
    prancha,
    loading: pranchaLoading,
    error: pranchaError,
    jobs,
    reload: reloadPrancha,
    updateQuadro,
    deleteQuadro,
    selectRender,
    generateRender,
  } = usePrancha(projectId, selectedId);

  // Keep per-prancha progress badges in sync as the selected prancha loads.
  useEffect(() => {
    if (prancha) {
      const done = prancha.quadros.filter((q) => q.selectedRenderId).length;
      setProgress((prev) => ({
        ...prev,
        [prancha.id]: { done, total: prancha.quadros.length },
      }));
    }
  }, [prancha]);

  const jobList = Object.values(jobs);

  // Prompt preview state
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptQuadroOrder, setPromptQuadroOrder] = useState<number | null>(
    null,
  );

  const viewPrompt = async (quadro: Quadro) => {
    if (!selectedId) return;
    setPromptOpen(true);
    setPromptLoading(true);
    setPromptError(null);
    setPromptText(null);
    setPromptQuadroOrder(quadro.order);
    try {
      const { prompt } = await comicsApi.quadros.prompt(
        projectId,
        selectedId,
        quadro.id,
      );
      setPromptText(prompt);
    } catch (e) {
      setPromptError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setPromptLoading(false);
    }
  };

  // Render viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerRender, setViewerRender] = useState<Render | PageRender | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const viewRender = (quadro: Quadro, renderId: string) => {
    if (!selectedId) return;
    const render = quadro.renders.find((r) => r.id === renderId) ?? null;
    setViewerRender(render);
    setViewerUrl(
      comicsApi.renders.imageUrl(projectId, selectedId, quadro.id, renderId),
    );
    setViewerOpen(true);
  };

  const viewPageRender = (render: PageRender) => {
    if (!selectedId) return;
    setViewerRender(render);
    setViewerUrl(comicsApi.renders.pageImageUrl(projectId, selectedId, render.id));
    setViewerOpen(true);
  };

  const setRenderMode = async (renderMode: PranchaRenderMode) => {
    if (!prancha || prancha.renderMode === renderMode) return;
    setModeSaving(true);
    try {
      await comicsApi.pranchas.update(projectId, prancha.id, { renderMode });
      await reloadPrancha();
      await reloadList();
    } finally {
      setModeSaving(false);
    }
  };

  const generatePageRender = async () => {
    if (!prancha) return;
    setPageGenerating(true);
    try {
      const { jobId } = await comicsApi.renders.generatePage(projectId, prancha.id);
      await new Promise<void>((resolve, reject) => {
        comicsApi.assembly.subscribeJob(
          projectId,
          jobId,
          (p) => {
            if (p.status === 'done') resolve();
            else if (p.status === 'error') reject(new Error(p.error ?? 'Falha ao gerar prancha'));
          },
          () => reject(new Error('Conexão de progresso perdida. A geração pode continuar rodando.')),
        );
      });
      await reloadPrancha();
    } finally {
      setPageGenerating(false);
    }
  };

  const sortedQuadros = useMemo(
    () =>
      prancha ? [...prancha.quadros].sort((a, b) => a.order - b.order) : [],
    [prancha],
  );

  const addQuadro = async () => {
    if (!prancha) return;
    const slotFormat = SLOT_FORMAT_BY_LAYOUT[prancha.layout];
    await comicsApi.quadros.add(projectId, prancha.id, {
      order: prancha.quadros.length + 1,
      slotFormat,
      composition: '',
      characters: [],
      setting: '',
      texts: [],
      restrictions: [],
      refs: [],
      selectedRenderId: null,
      renders: [],
    });
    await reloadPrancha();
  };

  return (
    <div className="flex gap-4">
      <aside className="w-64 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pranchas</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3 w-3" /> Nova
          </Button>
        </div>
        {listLoading && (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        )}
        <ul className="space-y-1">
          {pranchas.map((p) => {
            const prog = progress[p.id];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id);
                    setActiveQuadroId(null);
                  }}
                  className={cn(
                    'w-full rounded-md border p-2 text-left text-sm',
                    selectedId === p.id
                      ? 'border-primary bg-accent'
                      : 'border-border hover:bg-accent/50',
                  )}
                >
                  <div>
                    <span className="font-medium">#{p.number}</span>{' '}
                    {p.shortTitle}
                  </div>
                  {prog && (
                    <span className="text-xs text-muted-foreground">
                      {prog.done}/{prog.total} quadros
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {!listLoading && pranchas.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma prancha ainda.</p>
        )}
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        {!selectedId && (
          <p className="text-muted-foreground">Selecione uma prancha.</p>
        )}
        {pranchaLoading && (
          <p className="text-muted-foreground">Carregando prancha…</p>
        )}
        {pranchaError && <p className="text-destructive">{pranchaError}</p>}

        {prancha && (
          <>
            <div className="space-y-1 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">
                  #{prancha.number} {prancha.shortTitle}
                </h2>
                <Badge variant="outline">{prancha.layout}</Badge>
                <Badge variant="outline">{prancha.renderMode === 'page' ? 'página inteira' : 'painéis'}</Badge>
                <Badge variant="secondary">
                  {prancha.quadros.filter((q) => q.selectedRenderId).length}/
                  {prancha.quadros.length} renders selecionados
                </Badge>
              </div>
              {prancha.origin && (
                <p className="font-mono text-xs text-muted-foreground">
                  {prancha.origin}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant={prancha.renderMode === 'panels' || !prancha.renderMode ? 'secondary' : 'outline'}
                  disabled={modeSaving}
                  onClick={() => void setRenderMode('panels')}
                >
                  Painéis
                </Button>
                <Button
                  size="sm"
                  variant={prancha.renderMode === 'page' ? 'secondary' : 'outline'}
                  disabled={modeSaving}
                  onClick={() => void setRenderMode('page')}
                >
                  Página inteira
                </Button>
                {modeSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>

            {prancha.renderMode === 'page' && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Candidatos de página <span className="font-normal text-muted-foreground">· {prancha.pageRenders?.length ?? 0}</span>
                  </h3>
                  <Button size="sm" variant="outline" disabled={pageGenerating} onClick={() => void generatePageRender()}>
                    {pageGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Gerar página
                  </Button>
                </div>
                {(prancha.pageRenders ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Gere uma página inteira para usar este modo.</p>
                ) : (
                  <ul className="space-y-1">
                    {(prancha.pageRenders ?? []).map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {r.id.slice(0, 12)} · {r.generationModel ?? r.source}
                          {prancha.selectedPageRenderId === r.id && ' · selecionado'}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => viewPageRender(r)} title="Ver">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant={prancha.selectedPageRenderId === r.id ? 'secondary' : 'outline'}
                            onClick={async () => {
                              await comicsApi.renders.selectPage(projectId, prancha.id, r.id);
                              await reloadPrancha();
                            }}
                          >
                            {prancha.selectedPageRenderId === r.id ? 'Em uso' : 'Usar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await comicsApi.renders.removePage(projectId, prancha.id, r.id);
                              await reloadPrancha();
                            }}
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {jobList.length > 0 && (
              <div className="space-y-2">
                {jobList.map((job) => (
                  <AssemblyProgress key={job.id} job={job} />
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Layout</h3>
                <PranchaGrid
                  projectId={projectId}
                  prancha={prancha}
                  activeQuadroId={activeQuadroId}
                  onSelectQuadro={setActiveQuadroId}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Quadros ({prancha.quadros.length})
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void addQuadro()}
                  >
                    <Plus className="h-3 w-3" /> Adicionar quadro
                  </Button>
                </div>
                <div className="space-y-3">
                  {sortedQuadros.map((q) => (
                    <div
                      key={q.id}
                      className={cn(
                        activeQuadroId === q.id && 'rounded-lg ring-2 ring-primary',
                      )}
                    >
                      <QuadroCard
                        projectId={projectId}
                        pranchaId={prancha.id}
                        quadro={q}
                        onViewRender={viewRender}
                        onViewPrompt={(quadro) => void viewPrompt(quadro)}
                        onSelectRender={(quadroId, renderId) =>
                          void selectRender(quadroId, renderId)
                        }
                        onGenerate={(quadroId) =>
                          generateRender(quadroId).then(() => undefined)
                        }
                        onUpdate={updateQuadro}
                        onDelete={(quadroId) => void deleteQuadro(quadroId)}
                        onChanged={() => void reloadPrancha()}
                        onOpenStudio={
                          onGenerate && studioItems
                            ? () => {
                                const it = studioItems.find(
                                  (s) => s.key === `quadro:${prancha.id}:${q.id}`,
                                );
                                if (it) onGenerate(it);
                              }
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <CreatePranchaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        nextNumber={pranchas.length + 1}
        onCreated={(id) => {
          setCreateOpen(false);
          void reloadList();
          setSelectedId(id);
        }}
      />

      <PromptPreviewModal
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title={
          promptQuadroOrder != null
            ? `Prompt — Quadro Q${promptQuadroOrder}`
            : 'Prompt'
        }
        prompt={promptText}
        loading={promptLoading}
        error={promptError}
      />

      <RenderViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        render={viewerRender}
        imageUrl={viewerUrl}
      />
    </div>
  );
}

interface CreatePranchaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  nextNumber: number;
  onCreated: (id: string) => void;
}

function CreatePranchaDialog({
  open,
  onOpenChange,
  projectId,
  nextNumber,
  onCreated,
}: CreatePranchaDialogProps) {
  const [shortTitle, setShortTitle] = useState('');
  const [layout, setLayout] = useState<PranchaLayout>('grid-2x2');
  const [origin, setOrigin] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await comicsApi.pranchas.create(projectId, {
        shortTitle: shortTitle.trim() || `Prancha ${nextNumber}`,
        layout,
        origin: origin.trim() || undefined,
        number: nextNumber,
        autoQuadros: true,
      });
      setShortTitle('');
      setOrigin('');
      setLayout('grid-2x2');
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova prancha</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="p-title">Título curto</Label>
            <Input
              id="p-title"
              value={shortTitle}
              placeholder="Cartório — Manhã"
              onChange={(e) => setShortTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Layout</Label>
            <Select
              value={layout}
              onValueChange={(v) => setLayout(v as PranchaLayout)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRANCHA_LAYOUTS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l} ({QUADRO_COUNT_BY_LAYOUT[l]} quadros)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-origin">Origem (roteiro)</Label>
            <Input
              id="p-origin"
              value={origin}
              placeholder="roteiro/ato_um.md · PRANCHA 14"
              onChange={(e) => setOrigin(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={creating} onClick={() => void create()}>
            {creating ? 'Criando…' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Pranchas;
