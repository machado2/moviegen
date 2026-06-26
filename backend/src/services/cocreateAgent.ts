// The co-creation agent. A streaming chat where the model discusses the story
// with the user and incrementally builds the project through tools: it fills the
// outline (logline, themes, acts → beats), then explodes beats into scenes and
// scenes into shots. It shares the project-mutation tools' spirit with the parse
// agent, but the conductor is a conversation, not a one-shot conversion.
//
// Robustness: built on the Vercel AI SDK (streaming + multi-step tool loop), the
// same metered gateway as the parse (cost capture + mid-loop spend cap), and
// every mutation persists + commits through the existing services. The turn's
// transcript is persisted to our own ChatThread on finish.

import type { ServerResponse } from 'node:http';
import type { ChatToolEvent, Outline, OutlineBeat, Project } from '@mediagen/types';
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import { getAiConfig } from './settings.js';
import { assertUnderCap, getSpend, recordSpend } from './spend.js';
import { estimateCostUsd } from './catalog.js';
import { makeMeteredGateway } from './gateway.js';
import { getOutline, saveOutline, appendChatMessage } from './cocreate.js';
import { addCharacter, characterContext } from './character.js';
import { createScene, addShot, listSceneRefs, getScene } from './scene.js';
import { getProject } from './project.js';
import { projectDir } from '../storage/filesystem.js';
import { newId } from '../lib/ids.js';

const MAX_STEPS = 60;
// A co-creation turn is interactive; keep it bounded but generous for a model
// that explodes a whole act into scenes in one turn.
const TURN_TIMEOUT_MS = 10 * 60 * 1000;

function uiText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

// A compact snapshot of the current project state, injected into the system
// prompt so the model always knows what already exists without a read round-trip
// (read tools are still offered for drilling into a specific scene).
async function stateSummary(projectId: string, project: Project, outline: Outline): Promise<string> {
  const chars = characterContext(project);
  const scenes = await listSceneRefs(projectId);
  const acts = outline.acts
    .map((a) => {
      const beats = a.beats
        .map((b) => `    - [${b.id}] ${b.title}${b.sceneNumbers.length ? ` (cenas ${b.sceneNumbers.join(', ')})` : ''}: ${b.summary}`)
        .join('\n');
      return `  Ato ${a.number} — ${a.title}\n${beats || '    (sem beats)'}`;
    })
    .join('\n');
  return [
    `Logline: ${outline.logline || '(vazia)'}`,
    `Temas: ${outline.themes.length ? outline.themes.join(', ') : '(nenhum)'}`,
    `Outline:\n${acts || '  (sem atos)'}`,
    `Personagens: ${chars.length ? chars.map((c) => `${c.id} (${c.name})`).join(', ') : '(nenhum)'}`,
    `Cenas: ${scenes.length ? scenes.map((s) => `#${s.number} ${s.shortTitle}`).join(' | ') : '(nenhuma)'}`,
  ].join('\n');
}

const SYSTEM = (project: Project, summary: string) => `Você é um parceiro de co-criação de roteiro para uma pipeline de vídeo com IA. Você conversa com o autor em ${project.language} para desenvolver a história JUNTOS, um pedaço de cada vez.

Como trabalhar:
- Converse de forma natural e propositiva: faça perguntas, sugira opções, explique escolhas. NÃO despeje a estrutura inteira de uma vez sem alinhar com o autor.
- Construa a história pela ordem natural: primeiro a logline e os temas, depois o outline em atos → beats, e só então explodir beats em cenas e cenas em shots.
- Use as FERRAMENTAS para gravar o que vocês decidirem (set_logline, set_themes, add_act, add_beat, update_beat, add_character, add_scene, add_shot). Cada chamada persiste e versiona no projeto.
- Um shot é uma única ideia de câmera, no máximo 15 segundos. Personagens em um shot são referenciados por characterIds (os ids/slug deles).
- Ao ligar um beat às cenas que ele virou, use update_beat com sceneNumbers.
- Quando precisar do detalhe de uma cena existente, use get_scene_detail.
- Responda sempre conversando; as ferramentas são o efeito colateral, não substituem a conversa.

Estado atual do projeto:
${summary}`;

interface TurnDeps {
  projectId: string;
  uiMessages: UIMessage[];
  /** Aborts the turn (client disconnect). Combined with cap + timeout. */
  signal?: AbortSignal;
}

/** A streaming turn, exposed as a thin adapter so callers pipe to a Node response
 *  without depending on the AI SDK's (un-nameable) result generics. */
export interface CoCreateTurn {
  pipe: (res: ServerResponse) => void;
}

export async function runCoCreateTurn(deps: TurnDeps): Promise<CoCreateTurn> {
  const { projectId, uiMessages, signal } = deps;
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();

  // Refuse to even start a turn when the project is already over its cap. (For
  // streaming we can't meter mid-turn — see onFinish — so this per-turn gate is
  // the cap's main lever here.)
  const dir = projectDir(projectId);
  await assertUnderCap(dir, spendCapUsd);

  const project = await getProject(projectId);
  // The agent mutates this in place across tool calls; saved per mutation.
  const outline = await getOutline(projectId);
  const summary = await stateSummary(projectId, project, outline);

  const priorSpend = spendCapUsd != null ? (await getSpend(dir, spendCapUsd)).totalUsd : 0;
  const gateway = makeMeteredGateway({ apiKey, priorSpend, spendCapUsd });

  const timeout = AbortSignal.timeout(TURN_TIMEOUT_MS);
  const combined = AbortSignal.any(
    [signal, gateway.capSignal, timeout].filter((s): s is AbortSignal => Boolean(s)),
  );

  // Surfaced inline in the assistant message so the UI can show what the agent did.
  const toolEvents: ChatToolEvent[] = [];
  const note = (toolName: string, summaryText: string, ok = true) => {
    toolEvents.push({ tool: toolName, summary: summaryText, ok });
  };

  // Resolve a scene id from the number the agent references.
  const sceneIdByNumber = async (n: number): Promise<string | null> => {
    const refs = await listSceneRefs(projectId);
    return refs.find((r) => r.number === n)?.id ?? null;
  };

  const tools = {
    get_scene_detail: tool({
      description: 'Read the full detail (shots, lines) of an existing scene by its number.',
      inputSchema: z.object({ sceneNumber: z.number().int() }),
      execute: async ({ sceneNumber }) => {
        const id = await sceneIdByNumber(sceneNumber);
        if (!id) return `erro: cena ${sceneNumber} não existe`;
        const scene = await getScene(projectId, id);
        return JSON.stringify({
          number: scene.number,
          shortTitle: scene.shortTitle,
          summary: scene.summary,
          shots: scene.shots.map((s) => ({ order: s.order, camera: s.camera, action: s.action })),
        });
      },
    }),
    set_logline: tool({
      description: 'Set the one-sentence logline of the film.',
      inputSchema: z.object({ logline: z.string() }),
      execute: async ({ logline }) => {
        outline.logline = logline;
        await saveOutline(projectId, outline);
        note('set_logline', 'Logline definida');
        return 'ok: logline';
      },
    }),
    set_themes: tool({
      description: 'Set the list of themes/motifs of the film (replaces the list).',
      inputSchema: z.object({ themes: z.array(z.string()) }),
      execute: async ({ themes }) => {
        outline.themes = themes;
        await saveOutline(projectId, outline);
        note('set_themes', `Temas: ${themes.join(', ')}`);
        return 'ok: themes';
      },
    }),
    add_act: tool({
      description: 'Add an act to the outline (e.g. Setup, Confrontation, Resolution).',
      inputSchema: z.object({ number: z.number().int(), title: z.string() }),
      execute: async ({ number, title }) => {
        if (!outline.acts.some((a) => a.number === number)) {
          outline.acts.push({ number, title, beats: [] });
          outline.acts.sort((a, b) => a.number - b.number);
          await saveOutline(projectId, outline);
        }
        note('add_act', `Ato ${number}: ${title}`);
        return `ok: ato ${number}`;
      },
    }),
    add_beat: tool({
      description: 'Add a beat to an act of the outline.',
      inputSchema: z.object({
        actNumber: z.number().int(),
        title: z.string(),
        summary: z.string().optional(),
      }),
      execute: async ({ actNumber, title, summary }) => {
        let act = outline.acts.find((a) => a.number === actNumber);
        if (!act) {
          act = { number: actNumber, title: `Ato ${actNumber}`, beats: [] };
          outline.acts.push(act);
          outline.acts.sort((a, b) => a.number - b.number);
        }
        const beat: OutlineBeat = { id: newId('beat'), title, summary: summary ?? '', sceneNumbers: [] };
        act.beats.push(beat);
        await saveOutline(projectId, outline);
        note('add_beat', `Beat: ${title}`);
        return `ok: beat ${beat.id}`;
      },
    }),
    update_beat: tool({
      description: 'Update a beat (title, summary, and/or the scene numbers it was expanded into).',
      inputSchema: z.object({
        beatId: z.string(),
        title: z.string().optional(),
        summary: z.string().optional(),
        sceneNumbers: z.array(z.number().int()).optional(),
      }),
      execute: async ({ beatId, title, summary, sceneNumbers }) => {
        const beat = outline.acts.flatMap((a) => a.beats).find((b) => b.id === beatId);
        if (!beat) return `erro: beat ${beatId} não existe`;
        if (title !== undefined) beat.title = title;
        if (summary !== undefined) beat.summary = summary;
        if (sceneNumbers !== undefined) beat.sceneNumbers = sceneNumbers;
        await saveOutline(projectId, outline);
        note('update_beat', `Beat atualizado: ${beat.title}`);
        return 'ok: beat atualizado';
      },
    }),
    add_character: tool({
      description: 'Add a character (id is a lowercase slug, stable). Creates pending concept + voice assets.',
      inputSchema: z.object({
        id: z.string().optional(),
        name: z.string(),
        description: z.string().optional(),
        voiceDescription: z.string().optional().describe('tone, age, accent, pace — for TTS'),
      }),
      execute: async ({ id, name, description, voiceDescription }) => {
        const slug = await addCharacter(projectId, { id, name, description, voiceDescription });
        note('add_character', `Personagem: ${name}`);
        return `ok: personagem ${slug}`;
      },
    }),
    add_scene: tool({
      description: 'Add a scene to the project. Use the act/beat it expands from for context.',
      inputSchema: z.object({
        number: z.number().int().optional(),
        shortTitle: z.string(),
        slugTitle: z.string().optional(),
        summary: z.string().optional(),
        continuityIn: z.string().optional(),
        continuityOut: z.string().optional(),
      }),
      execute: async (args) => {
        const scene = await createScene(projectId, args);
        note('add_scene', `Cena ${scene.number}: ${scene.shortTitle}`);
        return `ok: cena ${scene.number} (id ${scene.id})`;
      },
    }),
    add_shot: tool({
      description: 'Add a shot to an existing scene (by number). A shot is one camera idea, at most 15s.',
      inputSchema: z.object({
        sceneNumber: z.number().int(),
        order: z.number().int().optional(),
        camera: z.string(),
        targetDuration: z.string().optional().describe('e.g. "12s", max "15s"'),
        action: z.string(),
        exit: z.string().optional(),
        diegeticTexts: z.array(z.string()).optional(),
        sounds: z.array(z.string()).optional(),
        lines: z
          .array(
            z.object({
              speaker: z.string().describe('character id or "narrator"'),
              type: z.enum(['dialogue', 'voice-over']),
              text: z.string(),
            }),
          )
          .optional(),
        characterIds: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const sceneId = await sceneIdByNumber(args.sceneNumber);
        if (!sceneId) return `erro: cena ${args.sceneNumber} não existe; chame add_scene antes`;
        const refs = (args.characterIds ?? []).map((assetId) => ({ assetId, required: true }));
        const shot = await addShot(projectId, sceneId, {
          order: args.order,
          camera: args.camera,
          targetDuration: args.targetDuration,
          action: args.action,
          exit: args.exit,
          diegeticTexts: args.diegeticTexts,
          sounds: args.sounds,
          lines: args.lines,
          refs,
        });
        note('add_shot', `Cena ${args.sceneNumber} · Shot ${shot.order}`);
        return `ok: cena ${args.sceneNumber} shot ${shot.order}`;
      },
    }),
  };

  const lastUser = [...uiMessages].reverse().find((m) => m.role === 'user');
  const userText = lastUser ? uiText(lastUser) : '';

  const result = streamText({
    model: gateway.provider(model),
    system: SYSTEM(project, summary),
    messages: await convertToModelMessages(uiMessages),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: combined,
    onFinish: async ({ text, totalUsage }) => {
      // Record cost + persist this turn's exchange to the durable thread. The
      // cost header isn't available on streaming responses, so fall back to a
      // token-based estimate from the catalog when the gateway didn't report it.
      const runSpend = gateway.runSpend();
      const costUsd =
        runSpend > 0 ? runSpend : await estimateCostUsd(model, totalUsage?.inputTokens, totalUsage?.outputTokens);
      if (costUsd != null || totalUsage) {
        await recordSpend(dir, {
          costUsd,
          promptTokens: totalUsage?.inputTokens,
          completionTokens: totalUsage?.outputTokens,
        });
      }
      if (userText) await appendChatMessage(projectId, { role: 'user', content: userText });
      await appendChatMessage(projectId, {
        role: 'assistant',
        content: text,
        toolEvents: toolEvents.length ? toolEvents : undefined,
      });
    },
  });

  return { pipe: (res: ServerResponse) => result.pipeUIMessageStreamToResponse(res) };
}
