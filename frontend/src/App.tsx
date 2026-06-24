import { useState } from 'react';
import { ArrowLeft, BookOpen, Film, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilmApp } from '@/FilmApp';
import { ComicsApp } from '@/ComicsApp';
import { ProjectList } from '@/components/ProjectList';
import { SettingsPanel } from '@/components/SettingsPanel';

type SelectedProject = { id: string; type: 'film' | 'comics' } | null;

export function App() {
  const [selected, setSelected] = useState<SelectedProject>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          {selected ? (
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Projetos
            </Button>
          ) : (
            <div className="flex items-center gap-2 font-bold">
              {selected === null && <Film className="h-5 w-5" />}
              MediaGen
            </div>
          )}
          {selected && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {selected.type === 'film' ? <Film className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              <span className="text-sm">{selected.type === 'film' ? 'Filme' : 'HQ'}</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" title="Configurações" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      <div className="p-4">
        {selected === null && (
          <ProjectList onSelect={setSelected} />
        )}
        {selected?.type === 'film' && (
          <FilmApp projectId={selected.id} />
        )}
        {selected?.type === 'comics' && (
          <ComicsApp projectId={selected.id} />
        )}
      </div>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export default App;
