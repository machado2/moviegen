import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsp from 'node:fs/promises';
import archiver from 'archiver';
import type { BookFormat } from '@moviegen/types';
import { ensureDir } from '../../storage/filesystem.js';
import { runPython } from './montagem.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const BOOK_PY = path.join(scriptDir, 'book.py');

export interface BookPage {
  number: number;      // prancha.number — used for the CBZ filename
  imagePath: string;   // absolute path to the assembled prancha PNG
}

/** Build a CBZ: a ZIP of page PNGs named {number:03d}.png in numeric order. */
export async function buildCbz(pages: BookPage[], output: string): Promise<void> {
  await ensureDir(path.dirname(output));
  await new Promise<void>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const out = createWriteStream(output);
    out.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(out);
    for (const p of pages) {
      archive.file(p.imagePath, { name: `${String(p.number).padStart(3, '0')}.png` });
    }
    void archive.finalize();
  });
}

/** Build PDF and/or EPUB via the Python script (img2pdf / ebooklib). */
export async function buildPdfEpub(
  images: string[],
  opts: { title: string; language: string; outputPdf?: string; outputEpub?: string },
): Promise<void> {
  if (!opts.outputPdf && !opts.outputEpub) return;
  if (opts.outputPdf) await ensureDir(path.dirname(opts.outputPdf));
  if (opts.outputEpub) await ensureDir(path.dirname(opts.outputEpub));
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'comicsgen-book-'));
  const specFile = path.join(dir, 'spec.json');
  await fsp.writeFile(
    specFile,
    JSON.stringify({
      images,
      title: opts.title,
      language: opts.language,
      outputPdf: opts.outputPdf,
      outputEpub: opts.outputEpub,
    }),
    'utf8',
  );
  try {
    await runPython([BOOK_PY, specFile]);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

export function isBookFormat(v: unknown): v is BookFormat {
  return v === 'cbz' || v === 'pdf' || v === 'epub';
}
