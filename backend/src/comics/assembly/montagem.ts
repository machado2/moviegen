import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import type { MontagemOptions, PranchaLayout } from '@mediagen/types';
import { PYTHON_BIN } from '../../config.js';
import { ensureDir } from '../../storage/filesystem.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const MONTAGEM_PY = path.join(scriptDir, 'montagem.py');

export interface MontageSpec extends MontagemOptions {
  layout: PranchaLayout;
  renders: string[];   // ordered absolute render paths
  output: string;      // absolute output PNG path
}

/** Compose one prancha PNG from its selected renders using the Pillow script. */
export async function montagePrancha(spec: MontageSpec): Promise<void> {
  await ensureDir(path.dirname(spec.output));
  const specFile = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), 'comicsgen-mont-')), 'spec.json');
  await fsp.writeFile(specFile, JSON.stringify(spec), 'utf8');
  try {
    await runPython([MONTAGEM_PY, specFile]);
  } finally {
    await fsp.rm(path.dirname(specFile), { recursive: true, force: true });
  }
}

export function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Python not found ("${PYTHON_BIN}"). Install python3 (+ Pillow / img2pdf / ebooklib).`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`python exited with code ${code}: ${stderr.slice(0, 800)}`));
    });
  });
}
