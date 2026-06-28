import { useRef, useState } from 'react';
import { BookOpen, Film, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import type { AllProjectSummary } from '@mediagen/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAllProjects } from '@/hooks/useAllProjects';
import { api } from '@/api/client';
import { comicsApi } from '@/api/comicsClient';
import { cn } from '@/lib/utils';

interface ProjectListProps {
  onSelect: (project: { id: string; type: 'film' | 'comics' }) => void;
}

export function ProjectList({ onSelect }: ProjectListProps) {
  const { projects, loading, error, reload } = useAllProjects();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'film' | 'comics'>('film');
  const [creating, setCreating] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<AllProjectSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<'film' | 'comics'>('film');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importProject = async (file: File) => {
    setImporting(true);
    setImportError(null);
    try {
      const created = importType === 'film'
        ? await api.projects.import(file)
        : await comicsApi.projects.import(file);
      await reload();
      setImportOpen(false);
      onSelect({ id: created.id, type: importType });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const createProject = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = newType === 'film'
        ? await api.projects.create({ title: newTitle.trim() })
        : await comicsApi.projects.create({ title: newTitle.trim() });
      await reload();
      setNewTitle('');
      setCreateOpen(false);
      onSelect({ id: created.id, type: newType });
    } finally {
      setCreating(false);
    }
  };

  const requestDelete = (project: AllProjectSummary) => {
    setProjectToDelete(project);
    setDeleteError(null);
  };

  const deleteProject = async () => {
    if (!projectToDelete) return;
    const project = projectToDelete;
    setDeletingId(project.id);
    setDeleteError(null);
    try {
      if (project.type === 'film') {
        await api.projects.remove(project.id);
      } else {
        await comicsApi.projects.remove(project.id);
      }
      await reload();
      setProjectToDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projetos</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportError(null); setImportOpen(true); }}>
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Novo projeto
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Carregando…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && projects.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum projeto ainda. Crie o primeiro.
        </p>
      )}

      <ul className="space-y-2">
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            deleting={deletingId === p.id}
            onSelect={onSelect}
            onDelete={requestDelete}
          />
        ))}
      </ul>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewType('film')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md border py-3 text-sm font-medium transition-colors',
                  newType === 'film'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <Film className="h-4 w-4" /> Filme
              </button>
              <button
                type="button"
                onClick={() => setNewType('comics')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md border py-3 text-sm font-medium transition-colors',
                  newType === 'comics'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <BookOpen className="h-4 w-4" /> HQ
              </button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="newTitle">Título</Label>
              <Input
                id="newTitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void createProject(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => void createProject()} disabled={creating || !newTitle.trim()}>
              {creating ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImportType('film')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md border py-3 text-sm font-medium transition-colors',
                  importType === 'film' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                <Film className="h-4 w-4" /> Filme
              </button>
              <button
                type="button"
                onClick={() => setImportType('comics')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md border py-3 text-sm font-medium transition-colors',
                  importType === 'comics' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                <BookOpen className="h-4 w-4" /> HQ
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Selecione um <code className="font-mono">.zip</code> exportado (estrutura ou completo).
              Cria um novo projeto a partir dele — inclusive de um projeto ainda inacabado.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importProject(f);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/70"
            />
            {importing && <p className="text-sm text-muted-foreground">Importando…</p>}
            {importError && <p className="text-sm text-destructive">{importError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) {
            setProjectToDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir projeto</DialogTitle>
            <DialogDescription>
              Esta ação remove permanentemente “{projectToDelete?.title}”.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setProjectToDelete(null);
                setDeleteError(null);
              }}
              disabled={!!deletingId}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void deleteProject()} disabled={!!deletingId}>
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deletingId ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectRow({
  project,
  deleting,
  onSelect,
  onDelete,
}: {
  project: AllProjectSummary;
  deleting: boolean;
  onSelect: ProjectListProps['onSelect'];
  onDelete: (project: AllProjectSummary) => void;
}) {
  const Icon = project.type === 'film' ? Film : BookOpen;
  const date = new Date(project.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <li>
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted">
        <button
          type="button"
          onClick={() => onSelect({ id: project.id, type: project.type })}
          disabled={deleting}
          className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left disabled:pointer-events-none disabled:opacity-60"
        >
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{project.title}</span>
          <Badge variant="outline" className="shrink-0 text-xs">
            {project.type === 'film' ? 'Filme' : 'HQ'}
          </Badge>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{date}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          title={`Excluir ${project.title}`}
          aria-label={`Excluir ${project.title}`}
          disabled={deleting}
          onClick={() => onDelete(project)}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </li>
  );
}
