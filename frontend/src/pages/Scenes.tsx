import { useEffect, useState } from 'react';
import type { Project, ProjectDTO } from '@mediagen/types';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShotCard } from '@/components/ShotCard';
import { useScenes, useScene } from '@/hooks/useScene';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

export interface ScenesProps {
  project: ProjectDTO;
}

export function Scenes({ project }: ScenesProps) {
  const projectId = project.id;
  const { scenes, loading: scenesLoading, reload: reloadScenes } =
    useScenes(projectId);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSceneId && scenes.length > 0) {
      setSelectedSceneId(scenes[0]?.id ?? null);
    }
  }, [scenes, selectedSceneId]);

  const {
    scene,
    loading: sceneLoading,
    error: sceneError,
    reload: reloadScene,
    selectTake,
    deleteShot,
    addShot,
  } = useScene(projectId, selectedSceneId);

  // The full Project (with assets map) is needed for prompt building.
  const projectForPrompt: Project = { ...project };

  const createScene = async () => {
    const number = scenes.length + 1;
    const created = await api.scenes.create(projectId, {
      number,
      shortTitle: `Scene ${number}`,
      slugTitle: '',
      targetDuration: '30s',
      summary: '',
      continuity: { in: '', out: '' },
      refs: [],
      shots: [],
    });
    await reloadScenes();
    setSelectedSceneId(created.id);
  };

  const addNewShot = async () => {
    if (!scene) return;
    await addShot({
      order: scene.shots.length + 1,
      targetDuration: '15s',
      camera: '',
      action: '',
      exit: '',
      diegeticTexts: [],
      sounds: [],
      lines: [],
      refs: [],
      selectedTakeId: null,
      takes: [],
    });
  };

  return (
    <div className="flex gap-4">
      <aside className="w-64 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Scenes</h2>
          <Button size="sm" variant="outline" onClick={() => void createScene()}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        {scenesLoading && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        <ul className="space-y-1">
          {scenes.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedSceneId(s.id)}
                className={cn(
                  'w-full rounded-md border p-2 text-left text-sm',
                  selectedSceneId === s.id
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50',
                )}
              >
                <span className="font-medium">#{s.number}</span> {s.shortTitle}
              </button>
            </li>
          ))}
        </ul>
        {!scenesLoading && scenes.length === 0 && (
          <p className="text-xs text-muted-foreground">No scenes yet.</p>
        )}
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        {!selectedSceneId && (
          <p className="text-muted-foreground">Select a scene.</p>
        )}
        {sceneLoading && <p className="text-muted-foreground">Loading scene…</p>}
        {sceneError && <p className="text-destructive">{sceneError}</p>}

        {scene && (
          <>
            <div className="space-y-1 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  #{scene.number} {scene.shortTitle}
                </h2>
                <Badge variant="outline">{scene.targetDuration}</Badge>
                <Badge variant="secondary">
                  {scene.shots.filter((s) => s.selectedTakeId).length}/
                  {scene.shots.length} takes selected
                </Badge>
              </div>
              {scene.slugTitle && (
                <p className="font-mono text-sm text-muted-foreground">
                  {scene.slugTitle}
                </p>
              )}
              {scene.summary && <p className="text-sm">{scene.summary}</p>}
              {(scene.continuity.in || scene.continuity.out) && (
                <p className="text-xs text-muted-foreground">
                  In: {scene.continuity.in || '—'} · Out:{' '}
                  {scene.continuity.out || '—'}
                </p>
              )}
              {scene.refs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className="text-xs font-medium">Scene refs:</span>
                  {scene.refs.map((ref) => (
                    <Badge key={ref.assetId} variant="outline">
                      {ref.assetId}
                      {ref.required ? ' *' : ''}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Shots ({scene.shots.length})
              </h3>
              <Button size="sm" variant="outline" onClick={() => void addNewShot()}>
                <Plus className="h-3 w-3" /> Add shot
              </Button>
            </div>

            <div className="space-y-3">
              {[...scene.shots]
                .sort((a, b) => a.order - b.order)
                .map((shot) => (
                  <ShotCard
                    key={shot.id}
                    project={projectForPrompt}
                    scene={scene}
                    shot={shot}
                    onSelectTake={(shotId, takeId) =>
                      void selectTake(shotId, takeId)
                    }
                    onDeleteShot={(shotId) => void deleteShot(shotId)}
                    onChanged={() => void reloadScene()}
                  />
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default Scenes;
