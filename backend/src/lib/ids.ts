import { randomUUID } from 'node:crypto';

/** Short unique id with an optional prefix, e.g. "take_a1b2c3d4". */
export function newId(prefix?: string): string {
  const raw = randomUUID().replace(/-/g, '').slice(0, 12);
  return prefix ? `${prefix}_${raw}` : raw;
}

/** Turn an arbitrary label into a filesystem/identifier-safe slug. */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 60) || 'item'
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}
