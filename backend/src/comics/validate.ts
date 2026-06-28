// Structural validators for comics import paths. Mirrors the film validators:
// imports must match the current types exactly or be refused with a field list.

import type {
  ComicsAssetRole,
  ComicsAssetStatus,
  ComicsAssetType,
  PranchaLayout,
  PranchaRenderMode,
  QuadroSlotFormat,
  QuadroTextType,
} from '@mediagen/types';

type Errors = string[];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const typeName = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

function str(v: unknown, p: string, e: Errors): void {
  if (typeof v !== 'string') e.push(`${p}: expected string, got ${typeName(v)}`);
}
function num(v: unknown, p: string, e: Errors): void {
  if (typeof v !== 'number' || Number.isNaN(v)) e.push(`${p}: expected number, got ${typeName(v)}`);
}
function strArray(v: unknown, p: string, e: Errors): void {
  if (!Array.isArray(v)) {
    e.push(`${p}: expected string[], got ${typeName(v)}`);
    return;
  }
  v.forEach((x, i) => str(x, `${p}[${i}]`, e));
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], p: string, e: Errors): void {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    e.push(`${p}: expected one of ${allowed.join(' | ')}, got ${JSON.stringify(v)}`);
  }
}

const ASSET_TYPES: readonly ComicsAssetType[] = ['image'];
const ASSET_ROLES: readonly ComicsAssetRole[] = ['character', 'style-reference', 'location'];
const ASSET_STATUSES: readonly ComicsAssetStatus[] = ['active', 'pending', 'external'];
const LAYOUTS: readonly PranchaLayout[] = [
  'rows-1', 'rows-2', 'rows-3', 'rows-4', 'grid-2x2', 'grid-2x3', 'grid-2x4', 'top-then-grid-2x2',
];
const RENDER_MODES: readonly PranchaRenderMode[] = ['panels', 'page'];
const SLOT_FORMATS: readonly QuadroSlotFormat[] = [
  'vertical de página inteira, proporção 2:3',
  'horizontal alto, proporção 4:3',
  'horizontal panorâmico, proporção 2:1',
  'horizontal muito panorâmico, proporção 3:1',
  'vertical, proporção 2:3',
  'quadrado, proporção 1:1',
];
const TEXT_TYPES: readonly QuadroTextType[] = [
  'dialogue', 'offscreen', 'voice-over', 'caption', 'sfx', 'sign', 'title',
];

function validateText(v: unknown, p: string, e: Errors): void {
  if (!isObj(v)) {
    e.push(`${p}: expected object`);
    return;
  }
  oneOf(v.type, TEXT_TYPES, `${p}.type`, e);
  str(v.text, `${p}.text`, e);
}

function validateAsset(v: unknown, p: string, e: Errors): void {
  if (!isObj(v)) {
    e.push(`${p}: expected object`);
    return;
  }
  str(v.id, `${p}.id`, e);
  oneOf(v.type, ASSET_TYPES, `${p}.type`, e);
  oneOf(v.role, ASSET_ROLES, `${p}.role`, e);
  oneOf(v.status, ASSET_STATUSES, `${p}.status`, e);
  if (v.file !== null) str(v.file, `${p}.file`, e);
}

function validateQuadro(v: unknown, p: string, e: Errors): void {
  if (!isObj(v)) {
    e.push(`${p}: expected object`);
    return;
  }
  str(v.id, `${p}.id`, e);
  num(v.order, `${p}.order`, e);
  oneOf(v.slotFormat, SLOT_FORMATS, `${p}.slotFormat`, e);
  str(v.composition, `${p}.composition`, e);
  strArray(v.characters, `${p}.characters`, e);
  str(v.setting, `${p}.setting`, e);
  if (!Array.isArray(v.texts)) e.push(`${p}.texts: expected array`);
  else v.texts.forEach((t, i) => validateText(t, `${p}.texts[${i}]`, e));
  strArray(v.restrictions, `${p}.restrictions`, e);
  strArray(v.refs, `${p}.refs`, e);
  if (v.selectedRenderId !== null) str(v.selectedRenderId, `${p}.selectedRenderId`, e);
  if (!Array.isArray(v.renders)) e.push(`${p}.renders: expected array`);
}

export function validatePrancha(v: unknown, path = 'prancha'): Errors {
  const e: Errors = [];
  if (!isObj(v)) return [`${path}: expected object`];
  str(v.id, `${path}.id`, e);
  num(v.number, `${path}.number`, e);
  str(v.shortTitle, `${path}.shortTitle`, e);
  str(v.origin, `${path}.origin`, e);
  oneOf(v.layout, LAYOUTS, `${path}.layout`, e);
  if (v.renderMode !== undefined) oneOf(v.renderMode, RENDER_MODES, `${path}.renderMode`, e);
  if (v.selectedPageRenderId !== undefined && v.selectedPageRenderId !== null) {
    str(v.selectedPageRenderId, `${path}.selectedPageRenderId`, e);
  }
  if (v.pageRenders !== undefined && !Array.isArray(v.pageRenders)) {
    e.push(`${path}.pageRenders: expected array`);
  }
  if (!Array.isArray(v.quadros)) e.push(`${path}.quadros: expected array`);
  else v.quadros.forEach((q, i) => validateQuadro(q, `${path}.quadros[${i}]`, e));
  return e;
}

export function validateComicsProject(v: unknown, path = 'project'): Errors {
  const e: Errors = [];
  if (!isObj(v)) return [`${path}: expected object`];
  str(v.id, `${path}.id`, e);
  str(v.title, `${path}.title`, e);
  str(v.language, `${path}.language`, e);
  str(v.createdAt, `${path}.createdAt`, e);
  str(v.updatedAt, `${path}.updatedAt`, e);
  str(v.globalStyle, `${path}.globalStyle`, e);
  strArray(v.restrictions, `${path}.restrictions`, e);
  if (!isObj(v.assets)) e.push(`${path}.assets: expected object map`);
  else for (const [k, a] of Object.entries(v.assets)) validateAsset(a, `${path}.assets.${k}`, e);
  if (!Array.isArray(v.pranchas)) e.push(`${path}.pranchas: expected array`);
  else
    v.pranchas.forEach((s, i) => {
      const sp = `${path}.pranchas[${i}]`;
      if (!isObj(s)) {
        e.push(`${sp}: expected object`);
        return;
      }
      str(s.id, `${sp}.id`, e);
      num(s.number, `${sp}.number`, e);
      str(s.shortTitle, `${sp}.shortTitle`, e);
      str(s.file, `${sp}.file`, e);
    });
  return e;
}

export function validateParsedComicsScript(v: unknown, path = 'parsedScript'): Errors {
  const e: Errors = [];
  if (!isObj(v)) return [`${path}: expected object`];
  str(v.title, `${path}.title`, e);
  str(v.language, `${path}.language`, e);
  str(v.globalStyle, `${path}.globalStyle`, e);
  if (!Array.isArray(v.characters)) e.push(`${path}.characters: expected array`);
  else
    v.characters.forEach((c, i) => {
      const cp = `${path}.characters[${i}]`;
      if (!isObj(c)) {
        e.push(`${cp}: expected object`);
        return;
      }
      str(c.id, `${cp}.id`, e);
      str(c.name, `${cp}.name`, e);
      str(c.description, `${cp}.description`, e);
    });
  if (!Array.isArray(v.pranchas)) e.push(`${path}.pranchas: expected array`);
  else
    v.pranchas.forEach((s, i) => {
      const sp = `${path}.pranchas[${i}]`;
      if (!isObj(s)) {
        e.push(`${sp}: expected object`);
        return;
      }
      num(s.number, `${sp}.number`, e);
      str(s.shortTitle, `${sp}.shortTitle`, e);
      oneOf(s.layout, LAYOUTS, `${sp}.layout`, e);
      if (!Array.isArray(s.quadros)) e.push(`${sp}.quadros: expected array`);
    });
  return e;
}
