// Prompt construction for the comics format (ComicsGen / graphic novels).

import type { ComicsAsset, ComicsProject, Prancha, Quadro, QuadroText } from '@mediagen/types';
import { dot } from './text.js';

/**
 * The deterministic reference-image prompt for a comics character. Used by the
 * Estúdio to show/seed the prompt and by the backend as the fallback when the
 * client sends none.
 */
export function comicsCharacterPrompt(
  project: Pick<ComicsProject, 'title' | 'globalStyle'>,
  asset: Pick<ComicsAsset, 'characterName' | 'characterDescription' | 'id'>,
): string {
  return [
    `Folha de referência de personagem para a graphic novel "${project.title}".`,
    `Personagem: ${dot(asset.characterName ?? asset.id)}`,
    asset.characterDescription ? `Descrição: ${dot(asset.characterDescription)}` : '',
    project.globalStyle ? `Estilo visual (use só as pistas visuais): ${dot(project.globalStyle)}` : '',
    'Gere uma imagem de referência limpa: fundo neutro, corpo inteiro e um close do rosto, iluminação uniforme.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The deterministic reference-image prompt for a comics location/setting. */
export function comicsLocationPrompt(
  project: Pick<ComicsProject, 'title' | 'globalStyle'>,
  asset: Pick<ComicsAsset, 'characterName' | 'characterDescription' | 'description' | 'id'>,
): string {
  const name = asset.characterName ?? asset.id;
  const desc = asset.characterDescription ?? asset.description ?? '';
  return [
    `Imagem de referência de cenário para a graphic novel "${project.title}".`,
    `Cenário: ${dot(name)}`,
    desc ? `Descrição: ${dot(desc)}` : '',
    project.globalStyle ? `Estilo visual (use só as pistas visuais): ${dot(project.globalStyle)}` : '',
    'Gere uma vista ampla e limpa do local, sem personagens.',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatQuadroText(t: QuadroText): string {
  const speaker = t.speaker ?? 'personagem';
  switch (t.type) {
    case 'dialogue':
      return `Balão de fala de ${speaker}: "${t.text}"`;
    case 'offscreen':
      return `Balão de fala de ${speaker}, vindo de fora do quadro: "${t.text}"`;
    case 'voice-over':
      return `Voz em off de ${speaker}: "${t.text}"`;
    case 'caption':
      return `Legenda de narração: "${t.text}"`;
    case 'sfx':
      return `Onomatopeia: "${t.text}"`;
    case 'sign':
      return `Texto da placa: "${t.text}"`;
    case 'title':
      return `Título na imagem: "${t.text}"`;
  }
}

/**
 * Assemble the full image-generation prompt for a quadro from the structured
 * fields of the Quadro, Prancha and ComicsProject. Mirrors the comics spec
 * "Prompt Assembly" section. Assets are attached as images by the caller; here
 * only the character descriptions are inlined.
 */
export function quadroPrompt(project: ComicsProject, prancha: Prancha, quadro: Quadro): string {
  const textLines =
    quadro.texts.length > 0
      ? quadro.texts.map(formatQuadroText).join('\n')
      : 'Nenhum texto essencial neste quadro.';

  const characterLines = quadro.characters
    .map((assetId) => {
      const asset = project.assets[assetId];
      if (!asset) return null;
      const name = asset.characterName ?? assetId;
      const desc = asset.characterDescription ?? asset.description ?? '';
      return desc ? `- ${name}: ${desc}` : `- ${name}`;
    })
    .filter((l): l is string => Boolean(l));
  const characters = characterLines.length > 0 ? characterLines.join('\n') : 'Nenhum personagem em destaque.';

  const restrictions = [...project.restrictions, ...quadro.restrictions];
  const restrictionsBlock =
    restrictions.length > 0 ? `\nRestrições:\n${restrictions.map((r) => `- ${r}`).join('\n')}\n` : '';

  return `Caso de uso: ilustração narrativa
Tipo de imagem: quadro individual de HQ, ${quadro.slotFormat}, estilo graphic novel

Pedido principal: Crie o quadro ${quadro.order} da prancha ${prancha.number} da graphic novel "${project.title}". Este é um quadro final de publicação, não um roteiro e não um esboço. A prancha final será montada depois, então gere somente este quadro como arte completa.

Composição do quadro: ${quadro.composition}

A proporção e orientação do quadro devem obedecer ao formato indicado acima. Mantenha balões, legendas, placas e onomatopeias dentro de uma área segura, afastados das bordas do quadro.

Textos do quadro, literalmente:
${textLines}

Observação de lettering: quando uma linha indicar quem fala, essa identificação é apenas instrução de produção. Dentro do balão, legenda, placa ou onomatopeia, escreva somente o texto entre aspas.

Personagens:
${characters}

Cenário e estilo: ${quadro.setting}. ${project.globalStyle}

Montagem: o quadro deve preencher todo o retângulo da imagem, sem moldura externa desenhada, sem borda própria e sem margem branca ao redor. Os gutters da página serão criados depois por montagem programática.

Restrições de texto: os textos listados devem estar legíveis em português, com acentos e pontuação corretos.
${restrictionsBlock}`.trimEnd();
}

/** The asset ids attached as images to the generation call (characters + refs). */
export function quadroAttachmentIds(quadro: Quadro): string[] {
  return Array.from(new Set([...quadro.characters, ...quadro.refs]));
}
