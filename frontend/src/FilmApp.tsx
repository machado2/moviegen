import { useState } from 'react';
import { useProject } from '@/hooks/useProject';
import { useFilmStudioItems } from '@/hooks/useStudioQueue';
import { Overview } from '@/pages/Overview';
import { Characters } from '@/pages/Characters';
import { Assets } from '@/pages/Assets';
import { Scenes } from '@/pages/Scenes';
import { Assembly } from '@/pages/Assembly';
import { Estudio } from '@/components/Estudio';
import { Pipeline } from '@/components/Pipeline';
import { History } from '@/components/History';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

type Tab = 'pipeline' | 'overview' | 'studio' | 'characters' | 'assets' | 'scenes' | 'assembly' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'overview', label: 'Projeto' },
  { id: 'studio', label: 'Estúdio' },
  { id: 'characters', label: 'Personagens' },
  { id: 'assets', label: 'Assets' },
  { id: 'scenes', label: 'Cenas' },
  { id: 'assembly', label: 'Montagem' },
  { id: 'history', label: 'Histórico' },
];

interface FilmAppProps {
  projectId: string;
}

export function FilmApp({ projectId }: FilmAppProps) {
  const [tab, setTab] = useState<Tab>('pipeline');
  const { project, reload: reloadProject } = useProject(projectId);
  const { items, loading: queueLoading, reload: reloadQueue } = useFilmStudioItems(
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
            unitLabel="Shots"
            onGoRoteiro={() => setTab('overview')}
            onGoStudio={() => setTab('studio')}
            onGoMontagem={() => setTab('assembly')}
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
        {tab === 'scenes' && <Scenes project={project} />}
        {tab === 'assembly' && <Assembly projectId={project.id} />}
        {tab === 'history' && (
          <History
            load={() => api.projects.history(project.id)}
            restore={(hash) => api.projects.restore(project.id, hash)}
            onRestored={() => void reloadProject()}
          />
        )}
      </main>
    </>
  );
}

export default FilmApp;
