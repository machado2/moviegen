// Prompt construction for the film format (MovieGen).

import type { Asset, AssetRef, Project, Scene, Shot } from '@mediagen/types';
import { dot } from './text.js';

/**
 * The deterministic reference-image prompt for a film character or location.
 * Used by the Estúdio to show/seed the prompt and by the backend as the fallback
 * when the client sends none. (An optional LLM pass — see the backend's
 * generateImagePrompt — can rewrite this into a cleaner, distilled version.)
 */
export function filmReferencePrompt(
  project: Pick<Project, 'title' | 'globalStyle'>,
  asset: Pick<Asset, 'role' | 'characterName' | 'description' | 'id'>,
): string {
  const isLocation = asset.role === 'location';
  const name = asset.characterName ?? asset.description ?? asset.id;
  return [
    isLocation
      ? `Imagem de referência de cenário para o filme "${project.title}".`
      : `Folha de referência de personagem para o filme "${project.title}".`,
    `${isLocation ? 'Cenário' : 'Personagem'}: ${dot(name)}`,
    asset.description ? `Descrição: ${dot(asset.description)}` : '',
    project.globalStyle ? `Estilo visual (use só as pistas visuais): ${dot(project.globalStyle)}` : '',
    isLocation
      ? 'Gere uma imagem ampla e limpa do local, sem personagens.'
      : 'Gere uma referência limpa: fundo neutro, corpo inteiro e um close do rosto.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Assemble a full text prompt for a shot, combining the global style,
 * scene/shot references, action, dialogue and sounds — ready to paste into a
 * video-generation tool or send to the gateway.
 */
export function shotPrompt(
  project: Pick<Project, 'globalStyle' | 'assets' | 'restrictions'>,
  scene: Pick<Scene, 'slugTitle' | 'shortTitle' | 'summary' | 'refs'>,
  shot: Shot,
): string {
  const lines: string[] = [];

  if (project.globalStyle.trim()) {
    lines.push(`# Global Style\n${project.globalStyle.trim()}`);
  }

  lines.push(
    `# Scene\n${scene.slugTitle || scene.shortTitle}` + (scene.summary ? `\n${scene.summary}` : ''),
  );

  const refLabel = (ref: AssetRef): string => {
    const asset: Asset | undefined = project.assets[ref.assetId];
    if (!asset) return ref.assetId;
    const desc = asset.description ? ` — ${asset.description}` : '';
    const role = ` (${asset.role})`;
    const req = ref.required ? ' [required]' : '';
    return `- ${asset.id}${role}${desc}${req}`;
  };

  const sceneRefs = scene.refs.map(refLabel);
  if (sceneRefs.length) {
    lines.push(`# Scene References\n${sceneRefs.join('\n')}`);
  }

  const shotRefs = shot.refs.map(refLabel);
  if (shotRefs.length) {
    lines.push(`# Shot References\n${shotRefs.join('\n')}`);
  }

  lines.push(`# Camera\n${shot.camera || '(unspecified)'}`);
  lines.push(`# Action\n${shot.action || '(unspecified)'}`);

  if (shot.exit.trim()) {
    lines.push(`# Exit\n${shot.exit.trim()}`);
  }

  if (shot.diegeticTexts.length) {
    lines.push(`# On-screen Text\n${shot.diegeticTexts.map((t) => `- ${t}`).join('\n')}`);
  }

  if (shot.lines.length) {
    const dialogue = shot.lines
      .map((l) => {
        const tag = l.type === 'voice-over' ? 'V.O.' : 'DIALOGUE';
        return `[${l.speaker.toUpperCase()} ${tag}] ${l.text}`;
      })
      .join('\n');
    lines.push(`# Dialogue\n${dialogue}`);
  }

  if (shot.sounds.length) {
    lines.push(`# Sound\n${shot.sounds.map((s) => `- ${s}`).join('\n')}`);
  }

  lines.push(`# Duration\n${shot.targetDuration}`);

  if (project.restrictions.length) {
    lines.push(`# Restrictions (never do)\n${project.restrictions.map((r) => `- ${r}`).join('\n')}`);
  }

  return lines.join('\n\n');
}
