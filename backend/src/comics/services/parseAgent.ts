// Agentic comics-script parser, mirroring the film one (services/parseAgent.ts)
// but for graphic novels. Instead of one blocking "return the whole JSON" call,
// the model builds the ParsedComicsScript incrementally through tool calls
// (set_metadata / add_character / add_prancha / add_quadro / finish). Each call
// is a visible step (live progress + step log), cost is metered via the shared
// gateway (with the spend cap honoured mid-loop), and a cancellation aborts the
// in-flight call and stops the loop.

import type {
  ParsedComicsCharacter,
  ParsedComicsScript,
  ParsedPrancha,
  ParsedQuadro,
  ComicsProject,
  QuadroText,
} from '@mediagen/types';
import { generateText, hasToolCall, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { getAiConfig } from '../../services/settings.js';
import { assertUnderCap, getSpend, recordSpend } from '../../services/spend.js';
import { makeMeteredGateway } from '../../services/gateway.js';
import { projectDir } from '../storage.js';
import { slotFormatFor } from '../layout.js';
import { HttpError } from '../../lib/errors.js';
import { validateParsedComicsScript } from '../validate.js';

const MAX_ROUNDS = 160;
const MAX_PRANCHAS = 1000;
const MAX_QUADROS = 12000;
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

/** Progress callback — same shape as a JobHandle.update. */
export type StepFn = (progress: number, message: string) => void;

// Kept in sync with the comics validators (validate.ts). The model is constrained
// to these exact values so a parse can't drift from the canonical format.
const LAYOUTS = ['rows-1', 'rows-2', 'rows-3', 'rows-4', 'grid-2x2', 'grid-2x3', 'grid-2x4', 'top-then-grid-2x2'] as const;
const TEXT_TYPES = ['dialogue', 'offscreen', 'voice-over', 'caption', 'sfx', 'sign', 'title'] as const;

const SYSTEM = `Você é um assistente de pré-produção de HQs / graphic novels. Converte um roteiro markdown em uma estrutura para um pipeline de produção por IA, CHAMANDO FERRAMENTAS — nunca responda com prosa ou JSON no conteúdo.

Procedimento:
1. Chame set_metadata uma vez (title, language, globalStyle).
2. Chame add_character para cada personagem (id = slug minúsculo, estável; description com aparência canônica: idade, etnia, figurino, postura).
3. Para cada prancha em ordem: chame add_prancha (escolhendo o layout adequado ao número de quadros), depois add_quadro para cada quadro dela.
   - Escolha o layout pelo nº de quadros da prancha: 1 -> "rows-1", 2 -> "rows-2", 3 -> "rows-3", 4 -> "rows-4" ou "grid-2x2", 6 -> "grid-2x3", 8 -> "grid-2x4", 5 -> "top-then-grid-2x2". O formato/proporção de cada quadro é derivado automaticamente do layout — você não escolhe.
   - Preserve os textos do roteiro VERBATIM, com acentuação e pontuação EXATAS; tipifique cada um.
   - Referencie os personagens do quadro por characterIds (os slugs).
   - Descreva composition (composição) e setting (cenário) em prosa imagética.
4. Quando o roteiro inteiro estiver parseado, chame finish.

Chame várias ferramentas por turno quando possível. Continue até chamar finish.`;

interface Builder {
  result: ParsedComicsScript;
  pranchaByNum: Map<number, ParsedPrancha>;
  quadroCount: number;
}

function buildTools(b: Builder, onStep: (msg: string) => void) {
  return {
    set_metadata: tool({
      description: 'Define os metadados da obra. Chame uma vez, primeiro.',
      inputSchema: z.object({
        title: z.string(),
        language: z.string().optional().describe('BCP-47, ex.: "pt-BR"'),
        globalStyle: z.string().describe('estilo visual geral da HQ'),
      }),
      execute: async ({ title, language, globalStyle }) => {
        b.result.title = title || b.result.title;
        if (language) b.result.language = language;
        b.result.globalStyle = globalStyle || b.result.globalStyle;
        onStep(`Título: "${title}"`);
        return 'ok: metadata';
      },
    }),
    add_character: tool({
      description: 'Adiciona um personagem. id é um slug minúsculo, estável.',
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional().describe('aparência canônica: idade, etnia, figurino, postura'),
      }),
      execute: async ({ id, name, description }) => {
        const slug = id.trim();
        if (!slug) return 'erro: id obrigatório';
        if (!b.result.characters.some((c) => c.id === slug)) {
          const character: ParsedComicsCharacter = { id: slug, name: name || slug, description: description ?? '' };
          b.result.characters.push(character);
        }
        onStep(`Personagem: ${name || slug}`);
        return `ok: personagem ${name || slug}`;
      },
    }),
    add_prancha: tool({
      description: 'Adiciona uma prancha (página). Chame antes dos quadros dela.',
      inputSchema: z.object({
        number: z.number().int(),
        shortTitle: z.string().describe('rótulo curto, ex.: "Cartório — Manhã"'),
        origin: z.string().optional().describe('referência de origem no roteiro'),
        layout: z.enum(LAYOUTS),
      }),
      execute: async ({ number, shortTitle, origin, layout }) => {
        if (!Number.isFinite(number)) return 'erro: number inválido';
        if (b.result.pranchas.length >= MAX_PRANCHAS) return 'erro: limite de pranchas atingido';
        if (!b.pranchaByNum.has(number)) {
          const prancha: ParsedPrancha = {
            number,
            shortTitle: shortTitle || `Prancha ${number}`,
            origin: origin ?? '',
            layout,
            quadros: [],
          };
          b.pranchaByNum.set(number, prancha);
          b.result.pranchas.push(prancha);
        }
        onStep(`Prancha ${number}: ${shortTitle}`);
        return `ok: prancha ${number}`;
      },
    }),
    add_quadro: tool({
      description: 'Adiciona um quadro a uma prancha existente (por número). O slotFormat NÃO é informado: é derivado do layout da prancha e da posição do quadro.',
      inputSchema: z.object({
        pranchaNumber: z.number().int().describe('a prancha a que este quadro pertence'),
        order: z.number().int(),
        composition: z.string().describe('composição do quadro, em prosa imagética'),
        setting: z.string().optional().describe('cenário'),
        characterIds: z.array(z.string()).optional(),
        texts: z
          .array(
            z.object({
              type: z.enum(TEXT_TYPES),
              speaker: z.string().optional().describe('nome do personagem, quando aplicável'),
              text: z.string().describe('texto literal, com acentuação e pontuação exatas'),
            }),
          )
          .optional(),
        restrictions: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const prancha = b.pranchaByNum.get(args.pranchaNumber);
        if (!prancha) return `erro: prancha ${args.pranchaNumber} não existe; chame add_prancha antes`;
        if (b.quadroCount >= MAX_QUADROS) return 'erro: limite de quadros atingido';
        const texts: QuadroText[] = (args.texts ?? []).map((t) => ({
          type: t.type,
          ...(t.speaker ? { speaker: t.speaker } : {}),
          text: t.text ?? '',
        }));
        const quadro: ParsedQuadro = {
          order: args.order || prancha.quadros.length + 1,
          // Derived from the prancha layout + position (0-based), never the model's
          // choice — this is what apply re-derives anyway, so keep it coherent here.
          slotFormat: slotFormatFor(prancha.layout, prancha.quadros.length),
          composition: args.composition ?? '',
          characterIds: args.characterIds ?? [],
          setting: args.setting ?? '',
          texts,
          restrictions: args.restrictions ?? [],
        };
        prancha.quadros.push(quadro);
        b.quadroCount += 1;
        const snippet = (quadro.composition || quadro.setting || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        onStep(`Prancha ${args.pranchaNumber} · Quadro ${quadro.order}${snippet ? ` — ${snippet}` : ''}`);
        return `ok: prancha ${args.pranchaNumber} quadro ${quadro.order}`;
      },
    }),
    finish: tool({
      description: 'Sinaliza que o roteiro inteiro foi parseado.',
      inputSchema: z.object({}),
      execute: async () => {
        onStep('Finalizando…');
        return 'ok: finish';
      },
    }),
  };
}

export async function parseComicsScriptAgentic(
  project: ComicsProject,
  markdown: string,
  signal?: AbortSignal,
  onStep?: StepFn,
): Promise<ParsedComicsScript> {
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();
  const dir = projectDir(project.id);
  await assertUnderCap(dir, spendCapUsd);

  const b: Builder = {
    result: { title: '', language: project.language, globalStyle: '', characters: [], pranchas: [] },
    pranchaByNum: new Map(),
    quadroCount: 0,
  };
  const estimate = () => Math.min(0.94, 0.15 + b.result.pranchas.length * 0.015 + b.quadroCount * 0.003);
  const emit = (msg: string) => onStep?.(estimate(), msg);

  const priorSpend = spendCapUsd != null ? (await getSpend(dir, spendCapUsd)).totalUsd : 0;
  const gateway = makeMeteredGateway({ apiKey, priorSpend, spendCapUsd });

  const timeout = AbortSignal.timeout(RUN_TIMEOUT_MS);
  const combined = AbortSignal.any(
    [signal, gateway.capSignal, timeout].filter((s): s is AbortSignal => Boolean(s)),
  );

  // Liveness heartbeat — see services/parseAgent.ts. Ticks elapsed time + counts
  // every ~2s so a long first model call doesn't look frozen. "⏳" keeps it on
  // the live status line, out of the step log.
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    const s = Math.round((Date.now() - startedAt) / 1000);
    const counts = `${b.result.pranchas.length} pranchas · ${b.quadroCount} quadros`;
    const tail = b.result.pranchas.length === 0 ? ' · o modelo está lendo o roteiro…' : '';
    onStep?.(estimate(), `⏳ Trabalhando há ${s}s · ${counts}${tail}`);
  }, 2000);

  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    emit('Lendo o roteiro e montando as pranchas…');
    const result = await generateText({
      model: gateway.provider(model),
      system: SYSTEM,
      prompt: `Idioma do projeto: ${project.language}\n\nRoteiro:\n\n${markdown}`,
      tools: buildTools(b, (msg) => emit(msg)),
      stopWhen: [hasToolCall('finish'), stepCountIs(MAX_ROUNDS)],
      abortSignal: combined,
    });
    usage = result.totalUsage;
  } catch (err) {
    if (signal?.aborted) throw new HttpError(499, 'Cancelado');
    if (gateway.capHit()) {
      throw new HttpError(
        402,
        `Teto de gasto atingido durante o parse (≈US$ ${(priorSpend + gateway.runSpend()).toFixed(4)}). Aumente o teto em Configurações ou use um modelo mais barato.`,
      );
    }
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new HttpError(504, `O modelo "${model}" não terminou o parse em ${RUN_TIMEOUT_MS / 60000} min.`);
    }
    throw new HttpError(502, `Parse via gateway falhou: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearInterval(heartbeat);
    const runSpend = gateway.runSpend();
    if (runSpend > 0 || usage) {
      await recordSpend(dir, {
        costUsd: runSpend > 0 ? runSpend : null,
        promptTokens: usage?.inputTokens,
        completionTokens: usage?.outputTokens,
      });
    }
  }

  const errors = validateParsedComicsScript(b.result);
  if (errors.length) {
    throw new HttpError(
      502,
      `O agente montou uma estrutura inválida (${b.result.pranchas.length} pranchas, ${b.quadroCount} quadros). Tente de novo ou com outro modelo de parse.`,
      errors.slice(0, 20),
    );
  }
  onStep?.(1, `Pronto: ${b.result.pranchas.length} pranchas · ${b.result.characters.length} personagens · ${b.quadroCount} quadros`);
  return b.result;
}
