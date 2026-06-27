import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Film, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilmApp } from '@/FilmApp';
import { ComicsApp } from '@/ComicsApp';
import { ProjectList } from '@/components/ProjectList';
import { SettingsPanel } from '@/components/SettingsPanel';
import { useSettings } from '@/hooks/useSettings';

type SelectedProject = { id: string; type: 'film' | 'comics' } | null;

// Location lives in the URL hash (#/<type>/<id>/<tab>) so a refresh or the
// browser back/forward button restores which project and tab you were on.
function readHash(): { sel: SelectedProject; tab: string | null } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [type, id, tab] = raw.split('/');
  if ((type === 'film' || type === 'comics') && id) {
    return { sel: { id, type }, tab: tab || null };
  }
  return { sel: null, tab: null };
}

function writeHash(sel: SelectedProject, tab: string | null): void {
  const next = sel ? `#/${sel.type}/${sel.id}${tab ? `/${tab}` : ''}` : '';
  if (window.location.hash !== next) window.location.hash = next;
}

export function App() {
  const initial = readHash();
  const [selected, setSelected] = useState<SelectedProject>(initial.sel);
  const [tab, setTab] = useState<string | null>(initial.tab);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings } = useSettings();
  // First-run gate: nothing can be parsed or generated without a gateway key.
  const needsKey = !!settings && !settings.hasApiKey && !settings.apiKeyFromEnv;

  // Reflect back/forward (and manual hash edits) into state.
  useEffect(() => {
    const onHash = () => {
      const next = readHash();
      setSelected(next.sel);
      setTab(next.tab);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const selectProject = useCallback((s: SelectedProject) => {
    setSelected(s);
    setTab(null);
    setProjectTitle(null);
    writeHash(s, null);
  }, []);

  const changeTab = useCallback(
    (t: string) => {
      setTab(t);
      setSelected((cur) => {
        writeHash(cur, t);
        return cur;
      });
    },
    [],
  );

  const goProjects = useCallback(() => {
    setSelected(null);
    setTab(null);
    setProjectTitle(null);
    writeHash(null, null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {selected ? (
            <Button variant="ghost" size="sm" onClick={goProjects} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Projetos
            </Button>
          ) : (
            <div className="flex items-center gap-2 font-bold">
              <Film className="h-5 w-5" />
              MediaGen
            </div>
          )}
          {selected && (
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {selected.type === 'film' ? (
                <Film className="h-4 w-4 shrink-0" />
              ) : (
                <BookOpen className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate text-sm font-medium text-foreground">
                {projectTitle ?? (selected.type === 'film' ? 'Filme' : 'HQ')}
              </span>
              <span className="hidden text-xs sm:inline">· {selected.type === 'film' ? 'Filme' : 'HQ'}</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" title="Configurações" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      {needsKey && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          <span>Configure a chave do gateway LLM para parsear roteiros e gerar mídia.</span>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Abrir Configurações
          </Button>
        </div>
      )}

      <div className="p-4">
        {selected === null && <ProjectList onSelect={selectProject} />}
        {selected?.type === 'film' && (
          <FilmApp
            projectId={selected.id}
            tab={tab ?? 'pipeline'}
            onTabChange={changeTab}
            onProjectTitle={setProjectTitle}
          />
        )}
        {selected?.type === 'comics' && (
          <ComicsApp
            projectId={selected.id}
            tab={tab ?? 'pipeline'}
            onTabChange={changeTab}
            onProjectTitle={setProjectTitle}
          />
        )}
      </div>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export default App;
