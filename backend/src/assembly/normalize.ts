import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { probe } from './probe.js';

// Canonical intermediate format. Every take is re-encoded to this before
// concatenation so the concat demuxer can safely use `-c copy`.
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const FPS = 24;

// Scale into 1920x1080 preserving aspect ratio, then pad (letterbox/pillarbox).
const VIDEO_FILTER = [
  `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
  `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
  'setsar=1',
  `fps=${FPS}`,
].join(',');

/**
 * Re-encode a take to the canonical format. If the take has no audio stream,
 * a silent stereo track is added so every normalized file has matching streams.
 * Returns the absolute path of the normalized temp file.
 */
export async function normalizeTake(takePath: string, outDir: string): Promise<string> {
  const info = await probe(takePath);
  const outPath = path.join(outDir, `norm-${path.basename(takePath)}.mp4`);

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    cmd.input(takePath);

    if (!info.hasAudio) {
      cmd.input('anullsrc=channel_layout=stereo:sample_rate=48000').inputOptions(['-f', 'lavfi']);
      cmd.outputOptions(['-map', '0:v:0', '-map', '1:a:0', '-shortest']);
    } else {
      cmd.outputOptions(['-map', '0:v:0', '-map', '0:a:0']);
    }

    cmd
      .videoFilters(VIDEO_FILTER)
      .videoCodec('libx264')
      .outputOptions([
        '-crf', '18',
        '-preset', 'slow',
        '-pix_fmt', 'yuv420p',
        '-r', String(FPS),
        '-vsync', 'cfr',
        '-movflags', '+faststart',
      ])
      .audioCodec('aac')
      .audioBitrate('192k')
      .audioFrequency(48000)
      .audioChannels(2)
      .on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
      .on('end', () => resolve())
      .save(outPath);
  });

  return outPath;
}
