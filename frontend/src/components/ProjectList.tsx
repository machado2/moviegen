import { useRef, useState } from 'react';
import { BookOpen, Film, Plus, Upload } from 'lucide-react';
import type { AllProjectSummary } from '@mediagen/types';
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
import { useAllProjects } from '@/hooks/useAllProjects';
import { api } from '@/api/client';
import { comicsApi } from '@/api/comicsClient';
import { cn } from '@/lib/utils';

interface ProjectListProps {
  onSelect: (project: { id: string; type: 'film' | 'comics' }) => void;
}

export function ProjectList({ onSelect }: ProjectListProps) {
  const { projects, loading, reload } = useAllProjects();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'film' | 'comics'>('film');
  const [creating, setCreating] = useState(false);

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

      {!loading && projects.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum projeto ainda. Crie o primeiro.
        </p>
      )}

      <ul className="space-y-2">
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} onSelect={onSelect} />
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
    </div>
  );
}

function ProjectRow({ project, onSelect }: { project: AllProjectSummary; onSelect: ProjectListProps['onSelect'] }) {
  const Icon = project.type === 'film' ? Film : BookOpen;
  const date = new Date(project.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect({ id: project.id, type: project.type })}
        className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium">{project.title}</span>
        <Badge variant="outline" className="shrink-0 text-xs">
          {project.type === 'film' ? 'Filme' : 'HQ'}
        </Badge>
        <span className="shrink-0 text-xs text-muted-foreground">{date}</span>
      </button>
    </li>
  );
}
