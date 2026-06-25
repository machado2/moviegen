import { useState } from 'react';
import { useComicsProject } from '@/hooks/comics/useComicsProject';
import { useComicsStudioItems } from '@/hooks/useStudioQueue';
import { Overview } from '@/pages/comics/Overview';
import { Characters } from '@/pages/comics/Characters';
import { Assets } from '@/pages/comics/Assets';
import { Pranchas } from '@/pages/comics/Pranchas';
import { Publication } from '@/pages/comics/Publication';
import { Estudio } from '@/components/Estudio';
import { Pipeline } from '@/components/Pipeline';
import { History } from '@/components/History';
import { comicsApi } from '@/api/comicsClient';
import { cn } from '@/lib/utils';

type Tab = 'pipeline' | 'overview' | 'studio' | 'characters' | 'assets' | 'pranchas' | 'publication' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'overview', label: 'Projeto' },
  { id: 'studio', label: 'Estúdio' },
  { id: 'characters', label: 'Personagens' },
  { id: 'assets', label: 'Assets' },
  { id: 'pranchas', label: 'Pranchas' },
  { id: 'publication', label: 'Publicação' },
  { id: 'history', label: 'Histórico' },
];

interface ComicsAppProps {
  projectId: string;
}

export function ComicsApp({ projectId }: ComicsAppProps) {
  const [tab, setTab] = useState<Tab>('pipeline');
  const { project, reload: reloadProject } = useComicsProject(projectId);
  const { items, loading: queueLoading, reload: reloadQueue } = useComicsStudioItems(
    projectId,
    () => void reloadProject(),
  );

  if (!project) {
    return <p className="text-muted-foreground">Carregando projeto…</p>;
  }

  return (
    <>
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
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
        {tab === 'pipeline' && (
          <Pipeline
            items={items}
            loading={queueLoading}
            unitLabel="Quadros"
            onGoRoteiro={() => setTab('overview')}
            onGoStudio={() => setTab('studio')}
            onGoMontagem={() => setTab('publication')}
          />
        )}
        {tab === 'overview' && <Overview project={project} onChanged={() => void reloadProject()} />}
        {tab === 'studio' &&
          (queueLoading ? (
            <p className="text-sm text-muted-foreground">Carregando fila de produção…</p>
          ) : (
            <Estudio
              items={items}
              onRefresh={reloadQueue}
              emptyHint="Nada para produzir ainda. Carregue um roteiro e parseie com IA primeiro."
            />
          ))}
        {tab === 'characters' && <Characters projectId={project.id} />}
        {tab === 'assets' && <Assets projectId={project.id} />}
        {tab === 'pranchas' && <Pranchas project={project} />}
        {tab === 'publication' && <Publication projectId={project.id} />}
        {tab === 'history' && (
          <History
            load={() => comicsApi.projects.history(project.id)}
            restore={(hash) => comicsApi.projects.restore(project.id, hash)}
            onRestored={() => void reloadProject()}
          />
        )}
      </main>
    </>
  );
}

export default ComicsApp;
