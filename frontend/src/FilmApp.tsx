import { useState } from 'react';
import { useProject } from '@/hooks/useProject';
import { Overview } from '@/pages/Overview';
import { Characters } from '@/pages/Characters';
import { Assets } from '@/pages/Assets';
import { Scenes } from '@/pages/Scenes';
import { Assembly } from '@/pages/Assembly';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'characters' | 'assets' | 'scenes' | 'assembly';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'characters', label: 'Characters' },
  { id: 'assets', label: 'Assets' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'assembly', label: 'Assembly' },
];

interface FilmAppProps {
  projectId: string;
}

export function FilmApp({ projectId }: FilmAppProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const { project, reload: reloadProject } = useProject(projectId);

  if (!project) {
    return <p className="text-muted-foreground">Carregando projeto…</p>;
  }

  return (
    <>
      <nav className="-mx-4 flex gap-1 border-b px-4">
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

      <main className="pt-4">
        {tab === 'overview' && <Overview project={project} onChanged={() => void reloadProject()} />}
        {tab === 'characters' && <Characters projectId={project.id} />}
        {tab === 'assets' && <Assets projectId={project.id} />}
        {tab === 'scenes' && <Scenes project={project} />}
        {tab === 'assembly' && <Assembly projectId={project.id} />}
      </main>
    </>
  );
}

export default FilmApp;
