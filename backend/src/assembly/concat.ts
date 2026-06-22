import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { writeText } from '../storage/filesystem.js';

/**
 * Concatenate already-normalized files with the concat demuxer. Because every
 * input shares the same codecs/timebase, `-c copy` is safe and fast.
 */
export async function concatFiles(files: string[], outputPath: string, workDir: string): Promise<void> {
  if (files.length === 0) throw new Error('Nothing to concatenate');

  const listPath = path.join(workDir, 'filelist.txt');
  const lines = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  await writeText(listPath, `${lines}\n`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
      .on('end', () => resolve())
      .save(outputPath);
  });
}
