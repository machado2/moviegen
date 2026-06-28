import type {
  ComicsProject,
  ParsedPrancha,
  ParsedQuadro,
  QuadroText,
  RawScene,
} from '@mediagen/types';
import { generateText, hasToolCall, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { getAiConfig } from '../../services/settings.js';
import { assertUnderCap, getSpend, recordSpend } from '../../services/spend.js';
import { makeMeteredGateway } from '../../services/gateway.js';
import { projectDir } from '../storage.js';
import { slotFormatFor } from '../layout.js';
import { HttpError } from '../../lib/errors.js';

const MAX_ROUNDS = 80;
const MAX_PRANCHAS = 24;
const MAX_QUADROS = 160;
const RUN_TIMEOUT_MS = 6 * 60 * 1000;

const LAYOUTS = ['rows-1', 'rows-2', 'rows-3', 'rows-4', 'grid-2x2', 'grid-2x3', 'grid-2x4', 'top-then-grid-2x2'] as const;
const TEXT_TYPES = ['dialogue', 'offscreen', 'voice-over', 'caption', 'sfx', 'sign', 'title'] as const;

export interface ComicsSceneTransformContext {
  cast: { id: string; name: string; description: string }[];
  locations: { id: string; name: string; description: string }[];
  prev?: { heading: string; text: string };
  next?: { heading: string };
}

const SYSTEM = `Você converte UMA cena narrativa de HQ em pranchas e quadros CHAMANDO FERRAMENTAS — nunca responda com prosa ou JSON.
Procedimento:
1. Chame add_prancha para cada prancha local desta cena, em ordem local começando em 1.
2. Chame add_quadro para cada quadro da prancha.
3. Chame finish.

Regras:
- ParsedPrancha.number é LOCAL à cena, não número global de página.
- Escolha layout pelo número de quadros. O slotFormat é derivado automaticamente pelo backend; você não escolhe.
- Preserve textos literais com acentuação e pontuação exatas.
- Referencie personagens por slugs fornecidos em characterIds.
- Use lugares fornecidos no setting/refs quando forem relevantes.
- Prefira 1 a 4 pranchas para uma cena normal; só exceda quando a cena exigir.`;

interface Builder {
  pranchas: ParsedPrancha[];
  byLocal: Map<number, ParsedPrancha>;
  quadroCount: number;
}

function buildTools(b: Builder, onStep: (msg: string) => void) {
  return {
    add_prancha: tool({
      description: 'Adiciona uma prancha local desta cena.',
      inputSchema: z.object({
        number: z.number().int().describe('número local dentro da cena, começando em 1'),
        shortTitle: z.string().optional(),
        layout: z.enum(LAYOUTS),
      }),
      execute: async ({ number, shortTitle, layout }) => {
        if (b.pranchas.length >= MAX_PRANCHAS) return 'erro: limite de pranchas atingido';
        if (!b.byLocal.has(number)) {
          const prancha: ParsedPrancha = {
            number,
            shortTitle: shortTitle || `Prancha ${number}`,
            origin: '',
            layout,
            quadros: [],
          };
          b.byLocal.set(number, prancha);
          b.pranchas.push(prancha);
        }
        onStep(`Prancha local ${number}: ${shortTitle || layout}`);
        return `ok: prancha ${number}`;
      },
    }),
    add_quadro: tool({
      description: 'Adiciona um quadro a uma prancha local existente.',
      inputSchema: z.object({
        pranchaNumber: z.number().int(),
        order: z.number().int().optional(),
        composition: z.string().optional(),
        setting: z.string().optional(),
        characterIds: z.array(z.string()).optional(),
        texts: z
          .array(
            z.object({
              type: z.enum(TEXT_TYPES),
              speaker: z.string().optional(),
              text: z.string(),
            }),
          )
          .optional(),
        restrictions: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const prancha = b.byLocal.get(args.pranchaNumber);
        if (!prancha) return `erro: prancha ${args.pranchaNumber} não existe`;
        if (b.quadroCount >= MAX_QUADROS) return 'erro: limite de quadros atingido';
        const index = prancha.quadros.length;
        const texts: QuadroText[] = (args.texts ?? []).map((t) => ({
          type: t.type,
          ...(t.speaker ? { speaker: t.speaker } : {}),
          text: t.text,
        }));
        const quadro: ParsedQuadro = {
          order: args.order || index + 1,
          slotFormat: slotFormatFor(prancha.layout, index),
          composition: args.composition ?? '',
          characterIds: args.characterIds ?? [],
          setting: args.setting ?? '',
          texts,
          restrictions: args.restrictions ?? [],
        };
        prancha.quadros.push(quadro);
        b.quadroCount += 1;
        onStep(`Prancha ${args.pranchaNumber} · Quadro ${quadro.order}`);
        return `ok: quadro ${quadro.order}`;
      },
    }),
    finish: tool({
      description: 'Chame quando a cena estiver totalmente transformada.',
      inputSchema: z.object({}),
      execute: async () => 'ok: finish',
    }),
  };
}

export async function transformComicsSceneAgentic(
  project: Pick<ComicsProject, 'id' | 'language' | 'globalStyle'>,
  rawScene: RawScene,
  ctx: ComicsSceneTransformContext,
  signal?: AbortSignal,
  onStep?: (progress: number, message: string) => void,
): Promise<ParsedPrancha[]> {
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();
  const dir = projectDir(project.id);
  await assertUnderCap(dir, spendCapUsd);

  const b: Builder = { pranchas: [], byLocal: new Map(), quadroCount: 0 };
  const emit = (msg: string) =>
    onStep?.(Math.min(0.92, 0.15 + b.pranchas.length * 0.08 + b.quadroCount * 0.02), msg);

  const tools = buildTools(b, emit);
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
    `Idioma: ${project.language}\n\nEstilo global: ${project.globalStyle}\n\n` +
    `Elenco (use estes slugs em characterIds):\n${castBlock}\n\nLugares:\n${locBlock}` +
    `${prevBlock}${nextBlock}\n\n=== CENA ${rawScene.number} — ${rawScene.heading} ===\n${rawScene.text}`;

  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    emit('Transformando cena em pranchas e quadros…');
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

  if (b.pranchas.length === 0 || b.quadroCount === 0) {
    throw new HttpError(502, 'A transformação não produziu pranchas/quadros. Tente de novo ou com outro modelo.');
  }
  b.pranchas.sort((a, b2) => a.number - b2.number);
  for (const prancha of b.pranchas) {
    prancha.origin = `scene-raw:${rawScene.number}:${prancha.number}`;
    prancha.quadros.sort((a, b2) => a.order - b2.order);
    prancha.quadros.forEach((q, i) => {
      q.order = i + 1;
      q.slotFormat = slotFormatFor(prancha.layout, i);
    });
  }
  return b.pranchas;
}
