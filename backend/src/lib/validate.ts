// Hand-written structural validators. Because there is "no silent format
// compatibility", import paths validate incoming JSON against the current types
// and refuse with a precise list of mismatches.

import type {
  Asset,
  AssetRole,
  AssetStatus,
  AssetType,
  DialogueLine,
  ParsedScript,
  Project,
  Scene,
  Shot,
} from '@moviegen/types';

type Path = string;
type Errors = string[];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, path: Path, errors: Errors): void {
  if (typeof v !== 'string') errors.push(`${path}: expected string, got ${typeName(v)}`);
}
function num(v: unknown, path: Path, errors: Errors): void {
  if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${path}: expected number, got ${typeName(v)}`);
}
function bool(v: unknown, path: Path, errors: Errors): void {
  if (typeof v !== 'boolean') errors.push(`${path}: expected boolean, got ${typeName(v)}`);
}
function strArray(v: unknown, path: Path, errors: Errors): void {
  if (!Array.isArray(v)) {
    errors.push(`${path}: expected string[], got ${typeName(v)}`);
    return;
  }
  v.forEach((x, i) => str(x, `${path}[${i}]`, errors));
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: Path, errors: Errors): void {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    errors.push(`${path}: expected one of ${allowed.join(' | ')}, got ${JSON.stringify(v)}`);
  }
}
function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

const ASSET_TYPES: readonly AssetType[] = ['image', 'audio', 'video'];
const ASSET_ROLES: readonly AssetRole[] = [
  'character-face', 'character-body', 'character-concept',
  'voice', 'voice-over', 'location', 'ambient-sound',
];
const ASSET_STATUSES: readonly AssetStatus[] = ['active', 'pending', 'external', 'no-video'];

function validateDialogueLine(v: unknown, path: Path, errors: Errors): void {
  if (!isObj(v)) {
    errors.push(`${path}: expected object`);
    return;
  }
  str(v.speaker, `${path}.speaker`, errors);
  oneOf(v.type, ['dialogue', 'voice-over'] as DialogueLine['type'][], `${path}.type`, errors);
  str(v.text, `${path}.text`, errors);
}

function validateAsset(v: unknown, path: Path, errors: Errors): void {
  if (!isObj(v)) {
    errors.push(`${path}: expected object`);
    return;
  }
  str(v.id, `${path}.id`, errors);
  oneOf(v.type, ASSET_TYPES, `${path}.type`, errors);
  oneOf(v.role, ASSET_ROLES, `${path}.role`, errors);
  oneOf(v.status, ASSET_STATUSES, `${path}.status`, errors);
  if (v.file !== null) str(v.file, `${path}.file`, errors);
  str(v.prompt, `${path}.prompt`, errors);
}

function validateShot(v: unknown, path: Path, errors: Errors): void {
  if (!isObj(v)) {
    errors.push(`${path}: expected object`);
    return;
  }
  str(v.id, `${path}.id`, errors);
  num(v.order, `${path}.order`, errors);
  str(v.targetDuration, `${path}.targetDuration`, errors);
  str(v.camera, `${path}.camera`, errors);
  str(v.action, `${path}.action`, errors);
  str(v.exit, `${path}.exit`, errors);
  strArray(v.diegeticTexts, `${path}.diegeticTexts`, errors);
  strArray(v.sounds, `${path}.sounds`, errors);
  if (!Array.isArray(v.lines)) errors.push(`${path}.lines: expected array`);
  else v.lines.forEach((l, i) => validateDialogueLine(l, `${path}.lines[${i}]`, errors));
  if (!Array.isArray(v.refs)) errors.push(`${path}.refs: expected array`);
  if (v.selectedTakeId !== null) str(v.selectedTakeId, `${path}.selectedTakeId`, errors);
  if (!Array.isArray(v.takes)) errors.push(`${path}.takes: expected array`);
}

export function validateScene(v: unknown, path = 'scene'): Errors {
  const errors: Errors = [];
  if (!isObj(v)) return [`${path}: expected object`];
  str(v.id, `${path}.id`, errors);
  num(v.number, `${path}.number`, errors);
  str(v.shortTitle, `${path}.shortTitle`, errors);
  str(v.slugTitle, `${path}.slugTitle`, errors);
  str(v.targetDuration, `${path}.targetDuration`, errors);
  str(v.summary, `${path}.summary`, errors);
  if (!isObj(v.continuity)) errors.push(`${path}.continuity: expected object`);
  else {
    str(v.continuity.in, `${path}.continuity.in`, errors);
    str(v.continuity.out, `${path}.continuity.out`, errors);
  }
  if (!Array.isArray(v.refs)) errors.push(`${path}.refs: expected array`);
  if (!Array.isArray(v.shots)) errors.push(`${path}.shots: expected array`);
  else v.shots.forEach((s, i) => validateShot(s, `${path}.shots[${i}]`, errors));
  return errors;
}

export function validateProject(v: unknown, path = 'project'): Errors {
  const errors: Errors = [];
  if (!isObj(v)) return [`${path}: expected object`];
  str(v.id, `${path}.id`, errors);
  str(v.title, `${path}.title`, errors);
  str(v.language, `${path}.language`, errors);
  str(v.createdAt, `${path}.createdAt`, errors);
  str(v.updatedAt, `${path}.updatedAt`, errors);
  str(v.globalStyle, `${path}.globalStyle`, errors);
  strArray(v.method, `${path}.method`, errors);
  strArray(v.restrictions, `${path}.restrictions`, errors);
  if (!isObj(v.assets)) errors.push(`${path}.assets: expected object map`);
  else for (const [k, a] of Object.entries(v.assets)) validateAsset(a, `${path}.assets.${k}`, errors);
  if (!Array.isArray(v.scenes)) errors.push(`${path}.scenes: expected array`);
  else
    v.scenes.forEach((s, i) => {
      const sp = `${path}.scenes[${i}]`;
      if (!isObj(s)) {
        errors.push(`${sp}: expected object`);
        return;
      }
      str(s.id, `${sp}.id`, errors);
      num(s.number, `${sp}.number`, errors);
      str(s.shortTitle, `${sp}.shortTitle`, errors);
      str(s.file, `${sp}.file`, errors);
    });
  return errors;
}

export function validateParsedScript(v: unknown, path = 'parsedScript'): Errors {
  const errors: Errors = [];
  if (!isObj(v)) return [`${path}: expected object`];
  str(v.title, `${path}.title`, errors);
  str(v.language, `${path}.language`, errors);
  str(v.globalStyle, `${path}.globalStyle`, errors);
  if (!Array.isArray(v.characters)) errors.push(`${path}.characters: expected array`);
  else
    v.characters.forEach((c, i) => {
      const cp = `${path}.characters[${i}]`;
      if (!isObj(c)) {
        errors.push(`${cp}: expected object`);
        return;
      }
      str(c.id, `${cp}.id`, errors);
      str(c.name, `${cp}.name`, errors);
      str(c.description, `${cp}.description`, errors);
      str(c.voiceDescription, `${cp}.voiceDescription`, errors);
    });
  if (!Array.isArray(v.scenes)) errors.push(`${path}.scenes: expected array`);
  else
    v.scenes.forEach((s, i) => {
      const sp = `${path}.scenes[${i}]`;
      if (!isObj(s)) {
        errors.push(`${sp}: expected object`);
        return;
      }
      num(s.number, `${sp}.number`, errors);
      str(s.shortTitle, `${sp}.shortTitle`, errors);
      str(s.slugTitle, `${sp}.slugTitle`, errors);
      str(s.summary, `${sp}.summary`, errors);
      if (!Array.isArray(s.shots)) errors.push(`${sp}.shots: expected array`);
    });
  return errors;
}

// Re-export type aliases used above for callers that want them.
export type { Asset, Project, Scene, Shot, ParsedScript };
