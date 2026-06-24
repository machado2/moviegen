import { useState } from 'react';
import { useComicsProject } from '@/hooks/comics/useComicsProject';
import { Overview } from '@/pages/comics/Overview';
import { Characters } from '@/pages/comics/Characters';
import { Assets } from '@/pages/comics/Assets';
import { Pranchas } from '@/pages/comics/Pranchas';
import { Publication } from '@/pages/comics/Publication';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'characters' | 'assets' | 'pranchas' | 'publication';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'characters', label: 'Personagens' },
  { id: 'assets', label: 'Assets' },
  { id: 'pranchas', label: 'Pranchas' },
  { id: 'publication', label: 'Publicação' },
];

interface ComicsAppProps {
  projectId: string;
}

export function ComicsApp({ projectId }: ComicsAppProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const { project, reload: reloadProject } = useComicsProject(projectId);

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
        {tab === 'pranchas' && <Pranchas project={project} />}
        {tab === 'publication' && <Publication projectId={project.id} />}
      </main>
    </>
  );
}

export default ComicsApp;
