import { useCallback, useEffect, useState } from 'react';
import {
  Clapperboard,
  Film,
  History as HistoryIcon,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  MessagesSquare,
  Settings2,
  Users,
  Wand2,
} from 'lucide-react';
import { useProject } from '@/hooks/useProject';
import { useFilmStudioItems } from '@/hooks/useStudioQueue';
import { useSpend } from '@/hooks/useSpend';
import { useSettings } from '@/hooks/useSettings';
import { Overview } from '@/pages/Overview';
import { CoCreate } from '@/components/CoCreate';
import { Assets } from '@/pages/Assets';
import { Scenes } from '@/pages/Scenes';
import { Assembly } from '@/pages/Assembly';
import { Estudio } from '@/components/Estudio';
import { ElencoCenarios } from '@/components/ElencoCenarios';
import { Storyboard } from '@/components/Storyboard';
import { Pipeline } from '@/components/Pipeline';
import { History } from '@/components/History';
import { ProjectShell, type NavGroup } from '@/components/ProjectShell';
import type { StudioItem } from '@/lib/studio';
import { api } from '@/api/client';

type Tab =
  | 'pipeline'
  | 'overview'
  | 'cocreate'
  | 'studio'
  | 'storyboard'
  | 'characters'
  | 'assets'
  | 'scenes'
  | 'assembly'
  | 'history';

const ic = 'h-4 w-4';
const NAV: NavGroup[] = [
  { items: [{ id: 'pipeline', label: 'Pipeline', icon: <LayoutDashboard className={ic} /> }] },
  {
    label: 'História',
    items: [
      { id: 'overview', label: 'Projeto', icon: <Settings2 className={ic} /> },
      { id: 'cocreate', label: 'Co-criar', icon: <MessagesSquare className={ic} /> },
    ],
  },
  {
    label: 'Produção',
    items: [
      { id: 'studio', label: 'Estúdio', icon: <Wand2 className={ic} /> },
      { id: 'storyboard', label: 'Storyboard', icon: <LayoutGrid className={ic} /> },
      { id: 'characters', label: 'Elenco', icon: <Users className={ic} /> },
      { id: 'assets', label: 'Assets', icon: <ImageIcon className={ic} /> },
      { id: 'scenes', label: 'Cenas', icon: <Film className={ic} /> },
    ],
  },
  { label: 'Finalização', items: [{ id: 'assembly', label: 'Montagem', icon: <Clapperboard className={ic} /> }] },
  { label: 'Geral', items: [{ id: 'history', label: 'Histórico', icon: <HistoryIcon className={ic} /> }] },
];

interface FilmAppProps {
  projectId: string;
  tab: string;
  onTabChange: (tab: string) => void;
  onProjectTitle?: (title: string | null) => void;
}

export function FilmApp({ projectId, tab: tabProp, onTabChange, onProjectTitle }: FilmAppProps) {
  const tab = tabProp as Tab;
  // The Estúdio is the single canonical generation surface: Storyboard/Elenco
  // "open in Estúdio" focused on a unit instead of a separate modal generator.
  const [studioFocus, setStudioFocus] = useState<string | null>(null);
  const openInStudio = useCallback(
    (item: StudioItem) => {
      setStudioFocus(item.key);
      onTabChange('studio');
    },
    [onTabChange],
  );
  // Clearing focus on a direct rail click keeps a later plain "Estúdio" visit
  // from re-focusing a stale unit.
  const navigate = useCallback(
    (id: string) => {
      setStudioFocus(null);
      onTabChange(id);
    },
    [onTabChange],
  );
  const { project, reload: reloadProject } = useProject(projectId);
  const onChanged = useCallback(() => void reloadProject(), [reloadProject]);
  const loadHistory = useCallback(() => api.projects.history(projectId), [projectId]);
  const restoreHistory = useCallback((hash: string) => api.projects.restore(projectId, hash), [projectId]);
  const { items, loading: queueLoading, reload: reloadQueue } = useFilmStudioItems(projectId, onChanged);
  const fetchSpend = useCallback(() => api.projects.spend(projectId), [projectId]);
  const { spend, reload: reloadSpend } = useSpend(fetchSpend);
  const { settings } = useSettings();
  // Keep the Pipeline's cost figure current when returning to it (e.g. after a parse).
  useEffect(() => {
    if (tab === 'pipeline') void reloadSpend();
  }, [tab, reloadSpend]);
  // After a restore, refresh both the project and the production queue so the
  // Pipeline / Storyboard / Estúdio reflect the restored state immediately.
  const afterRestore = useCallback(() => {
    onChanged();
    void reloadQueue();
    void reloadSpend();
  }, [onChanged, reloadQueue, reloadSpend]);
  // Report the project title up to the header chrome.
  useEffect(() => {
    onProjectTitle?.(project?.title ?? null);
  }, [project?.title, onProjectTitle]);

  if (!project) {
    return <p className="text-muted-foreground">Carregando projeto…</p>;
  }

  return (
    <ProjectShell nav={NAV} active={tab} onNavigate={navigate}>
      <>
        {tab === 'pipeline' && (
          <Pipeline
            items={items}
            loading={queueLoading}
            unitLabel="Shots"
            spend={spend}
            onGoRoteiro={() => onTabChange('overview')}
            onGoStudio={() => onTabChange('studio')}
            onGoMontagem={() => onTabChange('assembly')}
          />
        )}
        {tab === 'overview' && <Overview project={project} onChanged={onChanged} />}
        {tab === 'cocreate' && <CoCreate project={project} onChanged={onChanged} />}
        {tab === 'studio' &&
          (queueLoading ? (
            <p className="text-sm text-muted-foreground">Carregando fila de produção…</p>
          ) : (
            <Estudio
              items={items}
              initialFocusKey={studioFocus ?? undefined}
              onRefresh={reloadQueue}
              spend={spend}
              fetchSpend={fetchSpend}
              imageModels={settings?.imageModels ?? []}
              videoModels={settings?.videoModels ?? []}
              emptyHint="Nada para produzir ainda. Carregue um roteiro e parseie com IA primeiro."
            />
          ))}
        {tab === 'storyboard' && <Storyboard items={items} loading={queueLoading} onGenerate={openInStudio} />}
        {tab === 'characters' && (
          <ElencoCenarios items={items} loading={queueLoading} onGenerate={openInStudio} onRefresh={reloadQueue} />
        )}
        {tab === 'assets' && <Assets projectId={project.id} />}
        {tab === 'scenes' && <Scenes project={project} />}
        {tab === 'assembly' && <Assembly projectId={project.id} />}
        {tab === 'history' && (
          <History load={loadHistory} restore={restoreHistory} onRestored={afterRestore} />
        )}
      </>
    </ProjectShell>
  );
}

export default FilmApp;
