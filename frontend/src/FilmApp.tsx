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
import { GenerateModal } from '@/components/GenerateModal';
import { ProjectShell, type NavItem } from '@/components/ProjectShell';
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
const NAV: NavItem[] = [
  { id: 'pipeline', label: 'Pipeline', icon: <LayoutDashboard className={ic} /> },
  { id: 'overview', label: 'Projeto', icon: <Settings2 className={ic} /> },
  { id: 'cocreate', label: 'Co-criar', icon: <MessagesSquare className={ic} /> },
  { id: 'studio', label: 'Estúdio', icon: <Wand2 className={ic} /> },
  { id: 'storyboard', label: 'Storyboard', icon: <LayoutGrid className={ic} /> },
  { id: 'characters', label: 'Elenco', icon: <Users className={ic} /> },
  { id: 'assets', label: 'Assets', icon: <ImageIcon className={ic} /> },
  { id: 'scenes', label: 'Cenas', icon: <Film className={ic} /> },
  { id: 'assembly', label: 'Montagem', icon: <Clapperboard className={ic} /> },
  { id: 'history', label: 'Histórico', icon: <HistoryIcon className={ic} /> },
];

interface FilmAppProps {
  projectId: string;
}

export function FilmApp({ projectId }: FilmAppProps) {
  const [tab, setTab] = useState<Tab>('pipeline');
  // The unit currently open in the generation modal (from Storyboard/Elenco).
  const [genItem, setGenItem] = useState<StudioItem | null>(null);
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
  // After a result is saved/generated in the modal, refresh queue + spend.
  const genRefresh = useCallback(async () => {
    await reloadQueue();
    await reloadSpend();
  }, [reloadQueue, reloadSpend]);

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
            unitLabel="Shots"
            spend={spend}
            onGoRoteiro={() => setTab('overview')}
            onGoStudio={() => setTab('studio')}
            onGoMontagem={() => setTab('assembly')}
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
              onRefresh={reloadQueue}
              spend={spend}
              fetchSpend={fetchSpend}
              imageModels={settings?.imageModels ?? []}
          videoModels={settings?.videoModels ?? []}
              emptyHint="Nada para produzir ainda. Carregue um roteiro e parseie com IA primeiro."
            />
          ))}
        {tab === 'storyboard' && <Storyboard items={items} loading={queueLoading} onGenerate={setGenItem} />}
        {tab === 'characters' && (
          <ElencoCenarios items={items} loading={queueLoading} onGenerate={setGenItem} onRefresh={reloadQueue} />
        )}
        {tab === 'assets' && <Assets projectId={project.id} />}
        {tab === 'scenes' && <Scenes project={project} />}
        {tab === 'assembly' && <Assembly projectId={project.id} />}
        {tab === 'history' && (
          <History load={loadHistory} restore={restoreHistory} onRestored={afterRestore} />
        )}
        <GenerateModal
          open={genItem != null}
          onOpenChange={(o) => { if (!o) setGenItem(null); }}
          item={genItem}
          onRefresh={genRefresh}
          imageModels={settings?.imageModels ?? []}
          videoModels={settings?.videoModels ?? []}
          spend={spend}
          fetchSpend={fetchSpend}
        />
      </>
    </ProjectShell>
  );
}

export default FilmApp;
