import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProjects, useProject } from '@/hooks/useProject';
import { Overview } from '@/pages/Overview';
import { Characters } from '@/pages/Characters';
import { Assets } from '@/pages/Assets';
import { Scenes } from '@/pages/Scenes';
import { Assembly } from '@/pages/Assembly';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'characters' | 'assets' | 'scenes' | 'assembly';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'characters', label: 'Characters' },
  { id: 'assets', label: 'Assets' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'assembly', label: 'Assembly' },
];

/** The MovieGen (film) application shell: project selector + film tabs. */
export function FilmApp() {
  const { projects, reload: reloadProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const { project, reload: reloadProject } = useProject(selectedProjectId);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, selectedProjectId]);

  const createProject = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await api.projects.create({ title: newTitle.trim() });
      await reloadProjects();
      setSelectedProjectId(created.id);
      setNewTitle('');
      setCreateOpen(false);
      setTab('overview');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="w-56">
          <Select
            value={selectedProjectId ?? undefined}
            onValueChange={(v) => {
              setSelectedProjectId(v);
              setTab('overview');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      {selectedProjectId && (
        <nav className="-mx-4 mt-3 flex gap-1 border-t px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="pt-4">
        {!selectedProjectId && (
          <p className="text-muted-foreground">
            No project selected. Create one to get started.
          </p>
        )}
        {selectedProjectId && !project && (
          <p className="text-muted-foreground">Loading project…</p>
        )}
        {project && (
          <>
            {tab === 'overview' && (
              <Overview
                project={project}
                onChanged={() => {
                  void reloadProject();
                  void reloadProjects();
                }}
              />
            )}
            {tab === 'characters' && <Characters projectId={project.id} />}
            {tab === 'assets' && <Assets projectId={project.id} />}
            {tab === 'scenes' && <Scenes project={project} />}
            {tab === 'assembly' && <Assembly projectId={project.id} />}
          </>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="newTitle">Title</Label>
            <Input
              id="newTitle"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createProject();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createProject()}
              disabled={creating || !newTitle.trim()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FilmApp;
