// Builds the unified production queue (StudioItem[]) for a project. Shared by
// the Estúdio (which walks it) and the Pipeline dashboard (which summarizes it),
// so both see exactly the same notion of "what's pending".

import { useCallback, useEffect, useState } from 'react';
import type { Prancha, Scene } from '@mediagen/types';
import { api } from '@/api/client';
import { comicsApi } from '@/api/comicsClient';
import { buildShotPrompt } from '@/lib/prompt';
import type { StudioAttachment, StudioItem } from '@/lib/studio';

export interface StudioQueue {
  items: StudioItem[];
  loading: boolean;
  reload: () => Promise<void>;
}

function useQueue(build: () => Promise<StudioItem[]>, onChanged: () => void): StudioQueue {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setItems(await build());
    onChanged();
  }, [build, onChanged]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void build()
      .then((next) => {
        if (alive) setItems(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [build]);

  return { items, loading, reload };
}

const FILM_REFERENCE_ROLES = new Set([
  'character-concept',
  'character-face',
  'character-body',
  'location',
]);

function followFilmJob(projectId: string, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    api.assembly.subscribeJob(
      projectId,
      jobId,
      (p) => {
        if (p.status === 'done') resolve();
        else if (p.status === 'error') reject(new Error(p.error ?? 'Geração falhou'));
      },
      () => reject(new Error('Conexão de progresso perdida')),
    );
  });
}

export function useFilmStudioItems(projectId: string, onChanged: () => void): StudioQueue {
  const build = useCallback(async (): Promise<StudioItem[]> => {
    const fresh = await api.projects.get(projectId);
    const out: StudioItem[] = [];

    for (const asset of Object.values(fresh.assets)) {
      if (asset.type !== 'image' || !FILM_REFERENCE_ROLES.has(asset.role)) continue;
      const done = Boolean(asset.file);
      const isLocation = asset.role === 'location';
      const name = asset.characterName ?? asset.description ?? asset.id;
      const referencePrompt = [
        isLocation
          ? `Imagem de referência de cenário para o filme "${fresh.title}".`
          : `Folha de referência de personagem para o filme "${fresh.title}".`,
        `${isLocation ? 'Cenário' : 'Personagem'}: ${name}.`,
        asset.description ? `Descrição: ${asset.description}.` : '',
        fresh.globalStyle ? `Estilo visual: ${fresh.globalStyle}.` : '',
        isLocation
          ? 'Gere uma imagem ampla e limpa do local, sem personagens.'
          : 'Gere uma referência limpa: fundo neutro, corpo inteiro e um close do rosto.',
      ]
        .filter(Boolean)
        .join('\n');
      out.push({
        key: `asset:${asset.id}`,
        kind: isLocation ? 'location' : 'character',
        label: name,
        sublabel: isLocation ? 'Cenário' : 'Personagem',
        accepts: 'image',
        done,
        skipped: asset.skipped ?? false,
        queuePriority: asset.queuePriority,
        thumbnailUrl: done ? api.assets.fileUrl(projectId, asset.id) : undefined,
        setSkipped: async (s) => {
          await api.assets.update(projectId, asset.id, { skipped: s });
        },
        setPriority: async (p) => {
          await api.assets.update(projectId, asset.id, { queuePriority: p });
        },
        description: asset.description,
        setDescription: async (d) => {
          await api.assets.update(projectId, asset.id, { description: d });
        },
        getPrompt: async () => referencePrompt,
        getAttachments: () => [],
        submit: async (file) => {
          await api.assets.upload(projectId, asset.id, file);
        },
        apiGenerate: (opts) =>
          api.assets.generateImage(projectId, asset.id, { model: opts?.model, prompt: referencePrompt }),
        followJob: (jobId) => followFilmJob(projectId, jobId),
        selectedCandidateId: asset.selectedVariantId ?? null,
        listCandidates: async () =>
          (await api.assets.listVariants(projectId, asset.id)).map((v) => ({
            id: v.id,
            url: api.assets.variantUrl(projectId, asset.id, v.id),
            accepts: 'image' as const,
            source: v.source,
            model: v.generationModel,
            createdAt: v.createdAt,
          })),
        selectCandidate: async (id) => {
          await api.assets.selectVariant(projectId, asset.id, id);
        },
        deleteCandidate: async (id) => {
          await api.assets.removeVariant(projectId, asset.id, id);
        },
      });
    }

    const refs = await api.scenes.list(projectId);
    const scenes: Scene[] = await Promise.all(refs.map((r) => api.scenes.get(projectId, r.id)));
    scenes.sort((a, b) => a.number - b.number);
    for (const scene of scenes) {
      for (const shot of [...scene.shots].sort((a, b) => a.order - b.order)) {
        const done = Boolean(shot.selectedTakeId);
        out.push({
          key: `shot:${scene.id}:${shot.id}`,
          kind: 'shot',
          label: `Cena ${scene.number} · Shot ${shot.order}`,
          sublabel: scene.shortTitle,
          group: { id: scene.id, label: `Cena ${scene.number} · ${scene.shortTitle}`, order: scene.number },
          accepts: 'video',
          done,
          skipped: shot.skipped ?? false,
          queuePriority: shot.queuePriority,
          setSkipped: async (s) => {
            await api.shots.update(projectId, scene.id, shot.id, { skipped: s });
          },
          setPriority: async (p) => {
            await api.shots.update(projectId, scene.id, shot.id, { queuePriority: p });
          },
          getPrompt: async () => buildShotPrompt(fresh, scene, shot),
          getAttachments: (): StudioAttachment[] => {
            const att: StudioAttachment[] = [];
            for (const ref of [...scene.refs, ...shot.refs]) {
              const a = fresh.assets[ref.assetId];
              if (a?.file) att.push({ url: api.assets.fileUrl(projectId, ref.assetId), label: a.characterName ?? a.id });
            }
            return att;
          },
          submit: async (file) => {
            await api.takes.upload(projectId, scene.id, shot.id, file);
          },
          apiGenerate: (opts) =>
            api.shots.generateVideo(projectId, scene.id, shot.id, {
              model: opts?.model,
              prompt: buildShotPrompt(fresh, scene, shot),
            }),
          followJob: (jobId) => followFilmJob(projectId, jobId),
          selectedCandidateId: shot.selectedTakeId,
          listCandidates: async () =>
            (await api.takes.list(projectId, scene.id, shot.id)).map((t) => ({
              id: t.id,
              url: api.takes.streamUrl(projectId, scene.id, shot.id, t.id),
              accepts: 'video' as const,
              source: t.source,
              createdAt: t.createdAt,
            })),
          selectCandidate: async (id) => {
            await api.takes.select(projectId, scene.id, shot.id, id);
          },
          deleteCandidate: async (id) => {
            await api.takes.remove(projectId, scene.id, shot.id, id);
          },
        });
      }
    }
    return out;
  }, [projectId]);

  return useQueue(build, onChanged);
}

function followComicsJob(projectId: string, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    comicsApi.assembly.subscribeJob(
      projectId,
      jobId,
      (p) => {
        if (p.status === 'done') resolve();
        else if (p.status === 'error') reject(new Error(p.error ?? 'Geração falhou'));
      },
      () => reject(new Error('Conexão de progresso perdida')),
    );
  });
}

export function useComicsStudioItems(projectId: string, onChanged: () => void): StudioQueue {
  const build = useCallback(async (): Promise<StudioItem[]> => {
    const fresh = await comicsApi.projects.get(projectId);
    const out: StudioItem[] = [];

    for (const asset of Object.values(fresh.assets)) {
      if (asset.role !== 'character') continue;
      const done = Boolean(asset.file);
      const charPrompt = [
        `Folha de referência de personagem para a graphic novel "${fresh.title}".`,
        `Personagem: ${asset.characterName ?? asset.id}.`,
        asset.characterDescription ? `Descrição: ${asset.characterDescription}.` : '',
        fresh.globalStyle ? `Estilo visual: ${fresh.globalStyle}.` : '',
        'Gere uma imagem de referência limpa: fundo neutro, corpo inteiro e um close do rosto, iluminação uniforme.',
      ]
        .filter(Boolean)
        .join('\n');
      out.push({
        key: `char:${asset.id}`,
        kind: 'character',
        label: asset.characterName ?? asset.id,
        sublabel: 'Personagem',
        accepts: 'image',
        done,
        skipped: asset.skipped ?? false,
        queuePriority: asset.queuePriority,
        thumbnailUrl: done ? comicsApi.assets.fileUrl(projectId, asset.id) : undefined,
        setSkipped: async (s) => {
          await comicsApi.assets.update(projectId, asset.id, { skipped: s });
        },
        setPriority: async (p) => {
          await comicsApi.assets.update(projectId, asset.id, { queuePriority: p });
        },
        description: asset.characterDescription,
        setDescription: async (d) => {
          await comicsApi.assets.update(projectId, asset.id, { characterDescription: d });
        },
        getPrompt: async () => charPrompt,
        getAttachments: () => [],
        submit: async (file) => {
          await comicsApi.assets.upload(projectId, asset.id, file);
        },
        apiGenerate: (opts) =>
          comicsApi.assets.generateImage(projectId, asset.id, { model: opts?.model, prompt: charPrompt }),
        followJob: (jobId) => followComicsJob(projectId, jobId),
        selectedCandidateId: asset.selectedVariantId ?? null,
        listCandidates: async () =>
          (await comicsApi.assets.listVariants(projectId, asset.id)).map((v) => ({
            id: v.id,
            url: comicsApi.assets.variantUrl(projectId, asset.id, v.id),
            accepts: 'image' as const,
            source: v.source,
            model: v.generationModel,
            createdAt: v.createdAt,
          })),
        selectCandidate: async (id) => {
          await comicsApi.assets.selectVariant(projectId, asset.id, id);
        },
        deleteCandidate: async (id) => {
          await comicsApi.assets.removeVariant(projectId, asset.id, id);
        },
      });
    }

    const refs = await comicsApi.pranchas.list(projectId);
    const pranchas: Prancha[] = await Promise.all(refs.map((r) => comicsApi.pranchas.get(projectId, r.id)));
    pranchas.sort((a, b) => a.number - b.number);
    for (const prancha of pranchas) {
      for (const quadro of prancha.quadros) {
        const done = Boolean(quadro.selectedRenderId);
        out.push({
          key: `quadro:${prancha.id}:${quadro.id}`,
          kind: 'quadro',
          label: `Prancha ${prancha.number} · Q${quadro.order}`,
          sublabel: prancha.shortTitle,
          group: { id: prancha.id, label: `Prancha ${prancha.number} · ${prancha.shortTitle}`, order: prancha.number },
          accepts: 'image',
          done,
          skipped: quadro.skipped ?? false,
          queuePriority: quadro.queuePriority,
          thumbnailUrl:
            done && quadro.selectedRenderId
              ? comicsApi.renders.imageUrl(projectId, prancha.id, quadro.id, quadro.selectedRenderId)
              : undefined,
          setSkipped: async (s) => {
            await comicsApi.quadros.update(projectId, prancha.id, quadro.id, { skipped: s });
          },
          setPriority: async (p) => {
            await comicsApi.quadros.update(projectId, prancha.id, quadro.id, { queuePriority: p });
          },
          getPrompt: async () => (await comicsApi.quadros.prompt(projectId, prancha.id, quadro.id)).prompt,
          getAttachments: (): StudioAttachment[] => {
            const att: StudioAttachment[] = [];
            for (const id of [...quadro.characters, ...quadro.refs]) {
              const a = fresh.assets[id];
              if (a?.file) att.push({ url: comicsApi.assets.fileUrl(projectId, id), label: a.characterName ?? id });
            }
            return att;
          },
          submit: async (file) => {
            await comicsApi.renders.upload(projectId, prancha.id, quadro.id, file);
          },
          apiGenerate: (opts) => comicsApi.renders.generate(projectId, prancha.id, quadro.id, { model: opts?.model }),
          followJob: (jobId) => followComicsJob(projectId, jobId),
          selectedCandidateId: quadro.selectedRenderId,
          listCandidates: async () =>
            (await comicsApi.renders.list(projectId, prancha.id, quadro.id)).map((r) => ({
              id: r.id,
              url: comicsApi.renders.imageUrl(projectId, prancha.id, quadro.id, r.id),
              accepts: 'image' as const,
              source: r.source,
              model: r.generationModel,
              createdAt: r.createdAt,
            })),
          selectCandidate: async (id) => {
            await comicsApi.renders.select(projectId, prancha.id, quadro.id, id);
          },
          deleteCandidate: async (id) => {
            await comicsApi.renders.remove(projectId, prancha.id, quadro.id, id);
          },
        });
      }
    }
    return out;
  }, [projectId]);

  return useQueue(build, onChanged);
}
