// One-shot data migration for two changes:
//   1. Film projects move from data/projects -> data/films/projects, so both
//      media are namespaced consistently (data/films, data/comics).
//   2. On-disk metadata files become Nickel: project.json -> project.ncl and
//      scenes/*.json, pranchas/*.json -> *.ncl.
//
// Idempotent: already-migrated trees are skipped. Run inside the app container
// (DATA_DIR=/data, runs as root so it can rewrite root-owned files):
//   docker compose run --rm -v "$PWD/scripts:/scripts:ro" moviegen \
//     node /scripts/migrate-nickel-films.mjs
//
// The toNickel serializer below is a verbatim copy of backend/src/storage/
// nickel.ts so the script stays self-contained (no build/import needed).

import fsp from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');

// ─── toNickel (copy of backend/src/storage/nickel.ts) ────────────────────────
function escapeNickelString(s) {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '\\': out += '\\\\'; break;
      case '"': out += '\\"'; break;
      case '\n': out += '\\n'; break;
      case '\r': out += '\\r'; break;
      case '\t': out += '\\t'; break;
      case '%': out += '\\%'; break;
      default: {
        const code = ch.codePointAt(0);
        if (code < 0x20) out += `\\u{${code.toString(16)}}`;
        else out += ch;
      }
    }
  }
  return out;
}
const pad = (n) => '  '.repeat(n);
function emit(value, indent) {
  if (value === null || value === undefined) return 'null';
  switch (typeof value) {
    case 'string': return `"${escapeNickelString(value)}"`;
    case 'number':
      if (!Number.isFinite(value)) throw new Error('non-finite number');
      return String(value);
    case 'boolean': return value ? 'true' : 'false';
    case 'object': break;
    default: throw new Error(`cannot serialize ${typeof value}`);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => pad(indent + 1) + emit(v, indent + 1)).join(',\n')}\n${pad(indent)}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v]) => `${pad(indent + 1)}"${escapeNickelString(k)}" = ${emit(v, indent + 1)}`);
  return `{\n${lines.join(',\n')}\n${pad(indent)}}`;
}
const toNickel = (value) => `${emit(value, 0)}\n`;

// ─── helpers ─────────────────────────────────────────────────────────────────
async function exists(p) {
  try { await fsp.stat(p); return true; } catch { return false; }
}

async function convertJsonToNickel(jsonFile) {
  const nclFile = jsonFile.replace(/\.json$/, '.ncl');
  if (await exists(nclFile)) {
    console.log(`  skip (already .ncl): ${path.relative(DATA_DIR, jsonFile)}`);
    return;
  }
  const raw = await fsp.readFile(jsonFile, 'utf8');
  const value = JSON.parse(raw);
  const tmp = `${nclFile}.tmp-mig`;
  await fsp.writeFile(tmp, toNickel(value), 'utf8');
  await fsp.rename(tmp, nclFile);
  await fsp.rm(jsonFile);
  console.log(`  ✓ ${path.relative(DATA_DIR, jsonFile)} -> ${path.basename(nclFile)}`);
}

async function migrateProjectDir(projectDir, subdirs) {
  const projJson = path.join(projectDir, 'project.json');
  if (await exists(projJson)) await convertJsonToNickel(projJson);
  for (const sub of subdirs) {
    const dir = path.join(projectDir, sub);
    if (!(await exists(dir))) continue;
    for (const entry of await fsp.readdir(dir)) {
      if (entry.endsWith('.json')) await convertJsonToNickel(path.join(dir, entry));
    }
  }
}

async function migrateProjectsRoot(root, subdirs) {
  if (!(await exists(root))) return;
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    console.log(`Project: ${path.relative(DATA_DIR, path.join(root, entry.name))}`);
    await migrateProjectDir(path.join(root, entry.name), subdirs);
  }
}

// ─── run ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`DATA_DIR = ${DATA_DIR}`);

  // 1. Move film projects: data/projects -> data/films/projects
  const oldFilms = path.join(DATA_DIR, 'projects');
  const newFilms = path.join(DATA_DIR, 'films', 'projects');
  if ((await exists(oldFilms)) && !(await exists(newFilms))) {
    await fsp.mkdir(path.join(DATA_DIR, 'films'), { recursive: true });
    await fsp.rename(oldFilms, newFilms);
    console.log(`Moved data/projects -> data/films/projects`);
  } else if (await exists(oldFilms)) {
    console.log(`! Both data/projects and data/films/projects exist — leaving data/projects in place for manual review`);
  }

  // 2. JSON -> Nickel for film and comics project metadata
  console.log('— Films —');
  await migrateProjectsRoot(newFilms, ['scenes']);
  console.log('— Comics —');
  await migrateProjectsRoot(path.join(DATA_DIR, 'comics', 'projects'), ['pranchas']);

  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
