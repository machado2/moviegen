// Copy the comics assembly Python helpers into the build output.
// Replaces a POSIX `mkdir -p && cp` so the build runs on Windows too. Paths are
// resolved from this file's location, so the working directory doesn't matter.
import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(repoRoot, 'backend', 'src', 'comics', 'assembly');
const destDir = path.join(repoRoot, 'dist', 'comics', 'assembly');

await mkdir(destDir, { recursive: true });
const entries = await readdir(srcDir);
const pyFiles = entries.filter((name) => name.endsWith('.py'));
await Promise.all(
  pyFiles.map((name) => cp(path.join(srcDir, name), path.join(destDir, name))),
);
console.log(`copied ${pyFiles.length} .py asset(s) → ${path.relative(repoRoot, destDir)}`);
