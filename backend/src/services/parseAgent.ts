// Agentic screenplay parser, built on the Vercel AI SDK. Instead of one blocking
// "return the whole JSON" call, the model builds the structure incrementally
// through tool calls (set_metadata / add_character / add_scene / add_shot /
// finish). Each tool call is a visible step (live progress + a step log), the
// cost is metered (and the cap is honoured mid-loop), and a cancellation aborts
// the in-flight call and stops the loop. Far more robust than the one-shot call:
// a malformed piece is rejected per-tool and the model can correct it instead of
// failing wholesale.
//
// The SDK owns the multi-step tool loop (stopWhen), streaming, retries and
// cancellation. We keep two project-specific concerns: live per-step progress
// (emitted from each tool's execute) and dollar metering + the spend cap, which
// we enforce by intercepting the gateway's per-response cost header in a custom
// fetch and aborting the run the moment the cap is crossed.

import type { DialogueLine, ParsedScene, ParsedScript, ParsedShot, Project } from '@mediagen/types';
import { generateText, hasToolCall, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { getAiConfig } from './settings.js';
import { assertUnderCap, getSpend, recordSpend } from './spend.js';
import { makeMeteredGateway } from './gateway.js';
import { projectDir } from '../storage/filesystem.js';
import { HttpError } from '../lib/errors.js';
import { validateParsedScript } from '../lib/validate.js';

const MAX_ROUNDS = 120;
const MAX_SCENES = 500;
const MAX_SHOTS = 6000;
// A full screenplay can legitimately take minutes across many tool rounds; cap
// the whole run generously so a stalled connection can't hang the job forever.
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

/** Progress callback — same shape as a JobHandle.update. */
export type StepFn = (progress: number, message: string) => void;

interface Builder {
  result: ParsedScript;
  sceneByNum: Map<number, ParsedScene>;
  shotCount: number;
}

const SYSTEM = `You are a film pre-production assistant. You convert a markdown screenplay into a structured project by CALLING TOOLS — never reply with prose or JSON in the content.

Procedure:
1. Call set_metadata once (title, language, globalStyle).
2. Call add_character for every character (id = lowercase slug, stable).
3. For each scene in order: call add_scene, then add_shot for each of its shots.
   - Break scenes into shots of AT MOST 15 seconds; each shot is one camera idea.
   - Reference characters in a shot via characterIds (their slugs).
   - Put spoken lines in "lines" ({speaker, type, text}); speaker is a character id or "narrator".
4. When the entire screenplay is parsed, call finish.

Call several tools per turn when possible. Keep going until you call finish.`;

function buildTools(b: Builder, onStep: (msg: string) => void) {
  return {
    set_metadata: tool({
      description: 'Set the film-level metadata. Call once, first.',
      inputSchema: z.object({
        title: z.string(),
        language: z.string().optional().describe('BCP-47, e.g. "pt-BR"'),
        globalStyle: z.string().describe('overall visual style'),
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
      description: 'Add one character. id is a lowercase slug, stable across shots.',
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        voiceDescription: z.string().optional().describe('tone, age, accent, pace — for TTS'),
      }),
      execute: async ({ id, name, description, voiceDescription }) => {
        const slug = id.trim();
        if (!slug) return 'erro: id obrigatório';
        if (!b.result.characters.some((c) => c.id === slug)) {
          b.result.characters.push({
            id: slug,
            name: name || slug,
            description: description ?? '',
            voiceDescription: voiceDescription ?? '',
          });
        }
        onStep(`Personagem: ${name || slug}`);
        return `ok: personagem ${name || slug}`;
      },
    }),
    add_scene: tool({
      description: 'Add one scene. Call before its shots.',
      inputSchema: z.object({
        number: z.number().int(),
        shortTitle: z.string().describe('concise human label, e.g. "Brejo - Dawn"'),
        slugTitle: z.string().optional().describe('screenplay slug line'),
        summary: z.string().optional(),
        continuityIn: z.string().optional(),
        continuityOut: z.string().optional(),
      }),
      execute: async ({ number, shortTitle, slugTitle, summary, continuityIn, continuityOut }) => {
        if (!Number.isFinite(number)) return 'erro: number inválido';
        if (b.result.scenes.length >= MAX_SCENES) return 'erro: limite de cenas atingido';
        if (!b.sceneByNum.has(number)) {
          const scene: ParsedScene = {
            number,
            shortTitle: shortTitle || `Cena ${number}`,
            slugTitle: slugTitle ?? '',
            summary: summary ?? '',
            continuityIn: continuityIn ?? '',
            continuityOut: continuityOut ?? '',
            shots: [],
          };
          b.sceneByNum.set(number, scene);
          b.result.scenes.push(scene);
        }
        onStep(`Cena ${number}: ${shortTitle}`);
        return `ok: cena ${number}`;
      },
    }),
    add_shot: tool({
      description: 'Add one shot to an existing scene. A shot is a single camera idea, at most 15 seconds.',
      inputSchema: z.object({
        sceneNumber: z.number().int().describe('the scene this shot belongs to'),
        order: z.number().int(),
        camera: z.string(),
        targetDuration: z.string().optional().describe('e.g. "12s", max "15s"'),
        action: z.string().describe('what is seen, for a video generator'),
        exit: z.string().optional().describe('event that ends/transitions the shot'),
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
        const scene = b.sceneByNum.get(args.sceneNumber);
        if (!scene) return `erro: cena ${args.sceneNumber} não existe; chame add_scene antes`;
        if (b.shotCount >= MAX_SHOTS) return 'erro: limite de shots atingido';
        const lines: DialogueLine[] = (args.lines ?? []).map((l) => ({
          speaker: l.speaker || 'narrator',
          type: l.type === 'voice-over' ? 'voice-over' : 'dialogue',
          text: l.text ?? '',
        }));
        const shot: ParsedShot = {
          order: args.order || scene.shots.length + 1,
          camera: args.camera ?? '',
          targetDuration: args.targetDuration || '15s',
          action: args.action ?? '',
          exit: args.exit ?? '',
          diegeticTexts: args.diegeticTexts ?? [],
          sounds: args.sounds ?? [],
          lines,
          characterIds: args.characterIds ?? [],
        };
        scene.shots.push(shot);
        b.shotCount += 1;
        const snippet = (shot.camera || shot.action || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        onStep(`Cena ${args.sceneNumber} · Shot ${shot.order}${snippet ? ` — ${snippet}` : ''}`);
        return `ok: cena ${args.sceneNumber} shot ${shot.order}`;
      },
    }),
    finish: tool({
      description: 'Signal that the whole screenplay has been parsed.',
      inputSchema: z.object({}),
      execute: async () => {
        onStep('Finalizando…');
        return 'ok: finish';
      },
    }),
  };
}

export async function parseScriptAgentic(
  project: Project,
  markdown: string,
  signal?: AbortSignal,
  onStep?: StepFn,
): Promise<ParsedScript> {
  const { apiKey, parseModel: model, spendCapUsd } = await getAiConfig();
  const dir = projectDir(project.id);
  await assertUnderCap(dir, spendCapUsd);

  const b: Builder = {
    result: { title: '', language: project.language, globalStyle: '', characters: [], scenes: [] },
    sceneByNum: new Map(),
    shotCount: 0,
  };
  const estimate = () => Math.min(0.94, 0.15 + b.result.scenes.length * 0.02 + b.shotCount * 0.004);
  const emit = (msg: string) => onStep?.(estimate(), msg);

  // Cap enforcement is best-effort and mid-loop: the metered gateway accumulates
  // each call's cost and aborts (capSignal) the moment prior + this-run crosses
  // the cap. See gateway.ts.
  const priorSpend = spendCapUsd != null ? (await getSpend(dir, spendCapUsd)).totalUsd : 0;
  const gateway = makeMeteredGateway({ apiKey, priorSpend, spendCapUsd });

  const timeout = AbortSignal.timeout(RUN_TIMEOUT_MS);
  const combined = AbortSignal.any(
    [signal, gateway.capSignal, timeout].filter((s): s is AbortSignal => Boolean(s)),
  );

  // Liveness heartbeat: the first model call can take minutes before any tool
  // fires, during which there'd be no feedback. Tick elapsed time + current
  // counts every ~2s so the user can see it's working, not frozen. The "⏳"
  // prefix tells the UI to keep it on the live status line, out of the step log.
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    const s = Math.round((Date.now() - startedAt) / 1000);
    const counts = `${b.result.scenes.length} cenas · ${b.shotCount} shots`;
    const tail = b.result.scenes.length === 0 ? ' · o modelo está lendo o roteiro…' : '';
    onStep?.(estimate(), `⏳ Trabalhando há ${s}s · ${counts}${tail}`);
  }, 2000);

  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    emit('Lendo o roteiro e montando a estrutura…');
    const result = await generateText({
      model: gateway.provider(model),
      system: SYSTEM,
      prompt: `Idioma do projeto: ${project.language}\n\nRoteiro:\n\n${markdown}`,
      tools: buildTools(b, (msg) => emit(msg)),
      // Loop until the model calls finish, capped so a runaway can't spin forever.
      stopWhen: [hasToolCall('finish'), stepCountIs(MAX_ROUNDS)],
      abortSignal: combined,
    });
    usage = result.totalUsage;
  } catch (err) {
    // Distinguish *why* the run aborted so the user gets an actionable message.
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
    // Record whatever we actually spent, even on abort/timeout.
    const runSpend = gateway.runSpend();
    if (runSpend > 0 || usage) {
      await recordSpend(dir, {
        costUsd: runSpend > 0 ? runSpend : null,
        promptTokens: usage?.inputTokens,
        completionTokens: usage?.outputTokens,
      });
    }
  }

  const errors = validateParsedScript(b.result);
  if (errors.length) {
    throw new HttpError(
      502,
      `O agente montou uma estrutura inválida (${b.result.scenes.length} cenas, ${b.shotCount} shots). Tente de novo ou com outro modelo de parse.`,
      errors.slice(0, 20),
    );
  }
  onStep?.(1, `Pronto: ${b.result.scenes.length} cenas · ${b.result.characters.length} personagens · ${b.shotCount} shots`);
  return b.result;
}
