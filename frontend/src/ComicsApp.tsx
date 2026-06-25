import { useCallback, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  History as HistoryIcon,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  Settings2,
  Users,
  Wand2,
} from 'lucide-react';
import { useComicsProject } from '@/hooks/comics/useComicsProject';
import { useComicsStudioItems } from '@/hooks/useStudioQueue';
import { Overview } from '@/pages/comics/Overview';
import { Characters } from '@/pages/comics/Characters';
import { Assets } from '@/pages/comics/Assets';
import { Pranchas } from '@/pages/comics/Pranchas';
import { Publication } from '@/pages/comics/Publication';
import { Estudio } from '@/components/Estudio';
import { Storyboard } from '@/components/Storyboard';
import { Pipeline } from '@/components/Pipeline';
import { History } from '@/components/History';
import { ProjectShell, type NavItem } from '@/components/ProjectShell';
import { comicsApi } from '@/api/comicsClient';

type Tab =
  | 'pipeline'
  | 'overview'
  | 'studio'
  | 'storyboard'
  | 'characters'
  | 'assets'
  | 'pranchas'
  | 'publication'
  | 'history';

const ic = 'h-4 w-4';
const NAV: NavItem[] = [
  { id: 'pipeline', label: 'Pipeline', icon: <LayoutDashboard className={ic} /> },
  { id: 'overview', label: 'Projeto', icon: <Settings2 className={ic} /> },
  { id: 'studio', label: 'Estúdio', icon: <Wand2 className={ic} /> },
  { id: 'storyboard', label: 'Storyboard', icon: <LayoutGrid className={ic} /> },
  { id: 'characters', label: 'Personagens', icon: <Users className={ic} /> },
  { id: 'assets', label: 'Assets', icon: <ImageIcon className={ic} /> },
  { id: 'pranchas', label: 'Pranchas', icon: <BookOpen className={ic} /> },
  { id: 'publication', label: 'Publicação', icon: <BookMarked className={ic} /> },
  { id: 'history', label: 'Histórico', icon: <HistoryIcon className={ic} /> },
];

interface ComicsAppProps {
  projectId: string;
}

export function ComicsApp({ projectId }: ComicsAppProps) {
  const [tab, setTab] = useState<Tab>('pipeline');
  const [studioFocus, setStudioFocus] = useState<string | undefined>(undefined);
  const { project, reload: reloadProject } = useComicsProject(projectId);
  const onChanged = useCallback(() => void reloadProject(), [reloadProject]);
  const produce = useCallback((key: string) => {
    setStudioFocus(key);
    setTab('studio');
  }, []);
  const loadHistory = useCallback(() => comicsApi.projects.history(projectId), [projectId]);
  const restoreHistory = useCallback((hash: string) => comicsApi.projects.restore(projectId, hash), [projectId]);
  const { items, loading: queueLoading, reload: reloadQueue } = useComicsStudioItems(projectId, onChanged);
  // After a restore, refresh both the project and the production queue so the
  // Pipeline / Storyboard / Estúdio reflect the restored state immediately.
  const afterRestore = useCallback(() => {
    onChanged();
    void reloadQueue();
  }, [onChanged, reloadQueue]);

  if (!project) {
    return <p className="text-muted-foreground">Carregando projeto…</p>;
  }

  return (
    <ProjectShell nav={NAV} active={tab} onNavigate={(id) => setTab(id as Tab)}>
      <>
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
        {tab === 'overview' && <Overview project={project} onChanged={onChanged} />}
        {tab === 'studio' &&
          (queueLoading ? (
            <p className="text-sm text-muted-foreground">Carregando fila de produção…</p>
          ) : (
            <Estudio
              items={items}
              onRefresh={reloadQueue}
              initialFocusKey={studioFocus}
              emptyHint="Nada para produzir ainda. Carregue um roteiro e parseie com IA primeiro."
            />
          ))}
        {tab === 'storyboard' && <Storyboard items={items} loading={queueLoading} onProduce={produce} />}
        {tab === 'characters' && <Characters projectId={project.id} />}
        {tab === 'assets' && <Assets projectId={project.id} />}
        {tab === 'pranchas' && <Pranchas project={project} />}
        {tab === 'publication' && <Publication projectId={project.id} />}
        {tab === 'history' && (
          <History load={loadHistory} restore={restoreHistory} onRestored={afterRestore} />
        )}
      </>
    </ProjectShell>
  );
}

export default ComicsApp;
