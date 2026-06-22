import ffmpeg from 'fluent-ffmpeg';

export interface ProbeResult {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

/** Wrap ffprobe to read duration, codec, resolution and stream presence. */
export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const streams = data.streams ?? [];
      const video = streams.find((s) => s.codec_type === 'video');
      const audio = streams.find((s) => s.codec_type === 'audio');
      const duration = data.format?.duration;
      resolve({
        durationSeconds: typeof duration === 'number' && Number.isFinite(duration) ? duration : null,
        width: video?.width ?? null,
        height: video?.height ?? null,
        hasVideo: Boolean(video),
        hasAudio: Boolean(audio),
        videoCodec: video?.codec_name ?? null,
        audioCodec: audio?.codec_name ?? null,
      });
    });
  });
}
