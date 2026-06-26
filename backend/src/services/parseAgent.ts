// Agentic screenplay parser. Instead of one blocking "return the whole JSON"
// call, the model builds the structure incrementally through tool calls
// (set_metadata / add_character / add_scene / add_shot / finish). Each tool call
// is a visible step (live progress + a step log), the cost is metered per round
// (and the cap is honoured), and a cancellation aborts the in-flight round and
// stops the loop. Far more robust than the one-shot call — a malformed piece is
// rejected per-tool and the model can correct it instead of failing wholesale.

import type {
  DialogueLine,
  ParsedCharacter,
  ParsedScene,
  ParsedScript,
  ParsedShot,
  Project,
} from '@mediagen/types';
import { getAiConfig } from './settings.js';
import { assertUnderCap, recordSpend } from './spend.js';
import { chatWithTools, type AgentMessage } from './ai.js';
import { projectDir } from '../storage/filesystem.js';
import { HttpError } from '../lib/errors.js';
import { validateParsedScript } from '../lib/validate.js';

const MAX_ROUNDS = 120;
const MAX_SCENES = 500;
const MAX_SHOTS = 6000;

/** Progress callback — same shape as a JobHandle.update. */
export type StepFn = (progress: number, message: string) => void;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_metadata',
      description: 'Set the film-level metadata. Call once, first.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          language: { type: 'string', description: 'BCP-47, e.g. "pt-BR"' },
          globalStyle: { type: 'string', description: 'overall visual style' },
        },
        required: ['title', 'globalStyle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_character',
      description: 'Add one character. id is a lowercase slug, stable across shots.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          voiceDescription: { type: 'string', description: 'tone, age, accent, pace — for TTS' },
        },
        required: ['id', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_scene',
      description: 'Add one scene. Call before its shots.',
      parameters: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          shortTitle: { type: 'string', description: 'concise human label, e.g. "Brejo - Dawn"' },
          slugTitle: { type: 'string', description: 'screenplay slug line' },
          summary: { type: 'string' },
          continuityIn: { type: 'string' },
          continuityOut: { type: 'string' },
        },
        required: ['number', 'shortTitle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_shot',
      description: 'Add one shot to an existing scene. A shot is a single camera idea, at most 15 seconds.',
      parameters: {
        type: 'object',
        properties: {
          sceneNumber: { type: 'integer', description: 'the scene this shot belongs to' },
          order: { type: 'integer' },
          camera: { type: 'string' },
          targetDuration: { type: 'string', description: 'e.g. "12s", max "15s"' },
          action: { type: 'string', description: 'what is seen, for a video generator' },
          exit: { type: 'string', description: 'event that ends/transitions the shot' },
          diegeticTexts: { type: 'array', items: { type: 'string' } },
          sounds: { type: 'array', items: { type: 'string' } },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speaker: { type: 'string', description: 'character id or "narrator"' },
                type: { type: 'string', enum: ['dialogue', 'voice-over'] },
                text: { type: 'string' },
              },
              required: ['speaker', 'type', 'text'],
            },
          },
          characterIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['sceneNumber', 'order', 'camera', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'finish', description: 'Signal that the whole screenplay has been parsed.', parameters: { type: 'object', properties: {} } },
  },
];

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

interface Builder {
  result: ParsedScript;
  sceneByNum: Map<number, ParsedScene>;
  shotCount: number;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function applyTool(name: string, rawArgs: string, b: Builder): string {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
  } catch {
    return 'erro: argumentos não são JSON válido; tente de novo';
  }
  switch (name) {
    case 'set_metadata': {
      b.result.title = asString(args.title) || b.result.title;
      if (args.language) b.result.language = asString(args.language);
      b.result.globalStyle = asString(args.globalStyle) || b.result.globalStyle;
      return 'ok: metadata';
    }
    case 'add_character': {
      const id = asString(args.id).trim();
      if (!id) return 'erro: id obrigatório';
      const character: ParsedCharacter = {
        id,
        name: asString(args.name) || id,
        description: asString(args.description),
        voiceDescription: asString(args.voiceDescription),
      };
      if (!b.result.characters.some((c) => c.id === id)) b.result.characters.push(character);
      return `ok: personagem ${character.name}`;
    }
    case 'add_scene': {
      const number = Number(args.number);
      if (!Number.isFinite(number)) return 'erro: number inválido';
      if (b.result.scenes.length >= MAX_SCENES) return 'erro: limite de cenas atingido';
      const scene: ParsedScene = {
        number,
        shortTitle: asString(args.shortTitle) || `Cena ${number}`,
        slugTitle: asString(args.slugTitle),
        summary: asString(args.summary),
        continuityIn: asString(args.continuityIn),
        continuityOut: asString(args.continuityOut),
        shots: [],
      };
      if (!b.sceneByNum.has(number)) {
        b.sceneByNum.set(number, scene);
        b.result.scenes.push(scene);
      }
      return `ok: cena ${number}`;
    }
    case 'add_shot': {
      const sceneNumber = Number(args.sceneNumber);
      const scene = b.sceneByNum.get(sceneNumber);
      if (!scene) return `erro: cena ${args.sceneNumber} não existe; chame add_scene antes`;
      if (b.shotCount >= MAX_SHOTS) return 'erro: limite de shots atingido';
      const lines: DialogueLine[] = asArray(args.lines).map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        const type = o.type === 'voice-over' ? 'voice-over' : 'dialogue';
        return { speaker: asString(o.speaker) || 'narrator', type, text: asString(o.text) };
      });
      const shot: ParsedShot = {
        order: Number(args.order) || scene.shots.length + 1,
        camera: asString(args.camera),
        targetDuration: asString(args.targetDuration) || '15s',
        action: asString(args.action),
        exit: asString(args.exit),
        diegeticTexts: asArray(args.diegeticTexts).map(asString),
        sounds: asArray(args.sounds).map(asString),
        lines,
        characterIds: asArray(args.characterIds).map(asString),
      };
      scene.shots.push(shot);
      b.shotCount += 1;
      return `ok: cena ${sceneNumber} shot ${shot.order}`;
    }
    case 'finish':
      return 'ok: finish';
    default:
      return `erro: ferramenta desconhecida ${name}`;
  }
}

function stepMessage(name: string, args: Record<string, unknown>): string | null {
  switch (name) {
    case 'set_metadata': return `Título: "${asString(args.title)}"`;
    case 'add_character': return `Personagem: ${asString(args.name) || asString(args.id)}`;
    case 'add_scene': return `Cena ${asString(args.number)}: ${asString(args.shortTitle)}`;
    case 'add_shot': return `Cena ${asString(args.sceneNumber)} · Shot ${asString(args.order)}`;
    case 'finish': return 'Finalizando…';
    default: return null;
  }
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

  const messages: AgentMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Idioma do projeto: ${project.language}\n\nRoteiro:\n\n${markdown}` },
  ];

  let finished = false;
  let emptyRounds = 0;
  for (let round = 0; round < MAX_ROUNDS && !finished; round++) {
    if (signal?.aborted) throw new HttpError(499, 'Cancelado');
    onStep?.(
      estimate(),
      round === 0
        ? 'Lendo o roteiro e montando a estrutura…'
        : `Processando… ${b.result.scenes.length} cenas · ${b.shotCount} shots`,
    );

    const { message, spend } = await chatWithTools(apiKey, model, messages, TOOLS, signal);
    await recordSpend(dir, spend);
    await assertUnderCap(dir, spendCapUsd);
    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      // No tool calls this round — give it one nudge, then stop to avoid looping.
      if (++emptyRounds >= 2) break;
      messages.push({ role: 'user', content: 'Continue chamando as ferramentas até terminar; chame finish quando o roteiro inteiro estiver parseado.' });
      continue;
    }
    emptyRounds = 0;

    for (const tc of calls) {
      const name = tc.function?.name ?? '';
      const rawArgs = tc.function?.arguments ?? '{}';
      const out = applyTool(name, rawArgs, b);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
      if (!out.startsWith('erro')) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(rawArgs || '{}') as Record<string, unknown>; } catch { /* already acked */ }
        const msg = stepMessage(name, parsed);
        if (msg) onStep?.(estimate(), msg);
      }
      if (name === 'finish') finished = true;
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
