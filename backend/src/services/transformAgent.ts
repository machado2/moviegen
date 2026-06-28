// Per-scene transform: turns ONE raw scene into shots via the LLM. The expensive
// creative step, scoped to a single scene so it's incremental, reviewable and
// cheap to re-run. Mirrors parseAgent's metered-gateway + cap + cancellation
// boilerplate, but with a tiny tool set (add_shot / finish) over one scene.

import type { DialogueLine, ParsedScene, ParsedShot, Project, RawScene } from '@mediagen/types';
import { generateText, hasToolCall, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { getAiConfig } from './settings.js';
import { assertUnderCap, getSpend, recordSpend } from './spend.js';
import { makeMeteredGateway } from './gateway.js';
import { projectDir } from '../storage/filesystem.js';
import { HttpError } from '../lib/errors.js';

const MAX_ROUNDS = 60;
const MAX_SHOTS = 80;
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export interface SceneTransformContext {
  cast: { id: string; name: string; description: string }[];
  locations: { id: string; name: string; description: string }[];
  prev?: { heading: string; text: string };
  next?: { heading: string };
}

const SYSTEM = `You convert ONE screenplay scene into shots by CALLING TOOLS — never reply with prose or JSON.
Procedure: call add_shot for each shot (order ascending from 1), then call finish.
- Each shot is AT MOST 15 seconds and one camera idea.
- Reference characters/locations via characterIds (use the provided slugs).
- Put spoken lines in "lines" ({speaker, type, text}); speaker is a character id or "narrator".
Keep going until you call finish.`;

export async function transformSceneAgentic(
  project: Pick<Project, 'id' | 'language'>,
  rawScene: RawScene,
  ctx: SceneTransformContext,
  signal?: AbortSignal,
  onStep?: (progress: number, message: string) => void,
): Promise<ParsedScene> {
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();
  const dir = projectDir(project.id);
  await assertUnderCap(dir, spendCapUsd);

  const shots: ParsedShot[] = [];
  const tools = {
    add_shot: tool({
      description: 'Add one shot to this scene.',
      inputSchema: z.object({
        order: z.number().int(),
        camera: z.string().optional(),
        targetDuration: z.string().optional(),
        action: z.string().optional(),
        exit: z.string().optional(),
        diegeticTexts: z.array(z.string()).optional(),
        sounds: z.array(z.string()).optional(),
        lines: z
          .array(z.object({ speaker: z.string(), type: z.enum(['dialogue', 'voice-over']), text: z.string() }))
          .optional(),
        characterIds: z.array(z.string()).optional(),
      }),
      execute: async (s) => {
        if (shots.length >= MAX_SHOTS) return 'erro: limite de shots atingido';
        shots.push({
          order: s.order,
          camera: s.camera ?? '',
          targetDuration: s.targetDuration || '15s',
          action: s.action ?? '',
          exit: s.exit ?? '',
          diegeticTexts: s.diegeticTexts ?? [],
          sounds: s.sounds ?? [],
          lines: (s.lines ?? []) as DialogueLine[],
          characterIds: s.characterIds ?? [],
        });
        onStep?.(Math.min(0.9, 0.2 + shots.length * 0.05), `Shot ${s.order}`);
        return `ok: shot ${s.order}`;
      },
    }),
    finish: tool({
      description: 'Call when all shots for this scene have been added.',
      inputSchema: z.object({}),
      execute: async () => 'ok: finish',
    }),
  };

  const priorSpend = spendCapUsd != null ? (await getSpend(dir, spendCapUsd)).totalUsd : 0;
  const gateway = makeMeteredGateway({ apiKey, priorSpend, spendCapUsd });
  const timeout = AbortSignal.timeout(RUN_TIMEOUT_MS);
  const combined = AbortSignal.any(
    [signal, gateway.capSignal, timeout].filter((s): s is AbortSignal => Boolean(s)),
  );

  const castBlock = ctx.cast.map((c) => `- ${c.id} (${c.name}): ${c.description}`).join('\n') || '(nenhum)';
  const locBlock = ctx.locations.map((l) => `- ${l.id} (${l.name}): ${l.description}`).join('\n') || '(nenhum)';
  const prevBlock = ctx.prev ? `\n\nCena anterior (${ctx.prev.heading}):\n${ctx.prev.text.slice(0, 800)}` : '';
  const nextBlock = ctx.next ? `\n\nPróxima cena: ${ctx.next.heading}` : '';
  const prompt =
    `Idioma: ${project.language}\n\n` +
    `Elenco (use estes slugs em characterIds):\n${castBlock}\n\nLugares:\n${locBlock}` +
    `${prevBlock}${nextBlock}\n\n=== CENA ${rawScene.number} — ${rawScene.heading} ===\n${rawScene.text}`;

  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    onStep?.(0.1, 'Transformando a cena em shots…');
    const result = await generateText({
      model: gateway.provider(model),
      system: SYSTEM,
      prompt,
      tools,
      stopWhen: [hasToolCall('finish'), stepCountIs(MAX_ROUNDS)],
      abortSignal: combined,
    });
    usage = result.totalUsage;
  } catch (err) {
    if (signal?.aborted) throw new HttpError(499, 'Cancelado');
    if (gateway.capHit()) {
      throw new HttpError(
        402,
        `Teto de gasto atingido durante a transformação (≈US$ ${(priorSpend + gateway.runSpend()).toFixed(4)}). Aumente o teto em Configurações.`,
      );
    }
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new HttpError(504, `O modelo "${model}" não terminou a transformação a tempo.`);
    }
    throw new HttpError(502, `Transformação via gateway falhou: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    const runSpend = gateway.runSpend();
    if (runSpend > 0 || usage) {
      await recordSpend(dir, {
        costUsd: runSpend > 0 ? runSpend : null,
        promptTokens: usage?.inputTokens,
        completionTokens: usage?.outputTokens,
      });
    }
  }

  if (shots.length === 0) {
    throw new HttpError(502, 'A transformação não produziu shots. Tente de novo ou com outro modelo.');
  }
  shots.sort((a, b) => a.order - b.order);
  return {
    number: rawScene.number,
    shortTitle: rawScene.heading.slice(0, 60),
    slugTitle: rawScene.heading,
    summary: '',
    continuityIn: ctx.prev?.heading ?? '',
    continuityOut: ctx.next?.heading ?? '',
    shots,
  };
}
