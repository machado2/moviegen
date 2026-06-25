// Shared model for the Estúdio — the unified, semi-iterative generation screen.
//
// Every "generation unit" in a project (a character reference, a location, a
// shot, a quadro) is reduced to a StudioItem. The Estúdio component walks an
// ordered list of these and is medium-agnostic: each medium's adapter builds
// the items and owns the prompt/attachment/submit logic in closures.

export interface StudioAttachment {
  url: string;
  label: string;
}

export type StudioKind = 'character' | 'location' | 'shot' | 'quadro';

export interface StudioItem {
  /** Stable unique key (assetId, or `${sceneId}:${shotId}`, etc.). */
  key: string;
  kind: StudioKind;
  /** Primary label, e.g. "Dr. Euclides". */
  label: string;
  /** Secondary label, e.g. "Cena 3 · Shot 2". */
  sublabel?: string;
  /** Result channel: paste an image, or upload a video file. */
  accepts: 'image' | 'video';
  /** Whether this unit already has a selected result. */
  done: boolean;
  /** Thumbnail of the current selected result (images only). */
  thumbnailUrl?: string;
  /** Build the self-contained, copy-paste-ready prompt (may hit the API). */
  getPrompt: () => Promise<string>;
  /** Reference images to attach alongside the prompt in an external tool. */
  getAttachments: () => StudioAttachment[];
  /** Save a produced result (image blob wrapped as File, or a video File). */
  submit: (file: File) => Promise<void>;
  /** Optional API generation. Returns a jobId to follow, or resolves directly. */
  apiGenerate?: () => Promise<{ jobId: string } | void>;
  /** Follow an API job to completion (resolves when done, rejects on error). */
  followJob?: (jobId: string) => Promise<void>;
}

/** Order: pending references first (by relevance), then pending units, then done. */
export function orderStudioItems(items: StudioItem[]): StudioItem[] {
  const kindRank: Record<StudioKind, number> = { character: 0, location: 1, shot: 2, quadro: 2 };
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1; // pending first
    return kindRank[a.kind] - kindRank[b.kind];
  });
}

/** Turn a pasted/dropped blob into a File with a sensible name + extension. */
export function blobToFile(blob: Blob, baseName: string): File {
  const type = blob.type || 'image/png';
  const ext = type.split('/')[1]?.split('+')[0] || 'png';
  return new File([blob], `${baseName}.${ext}`, { type });
}

/** Extract the first image blob from a clipboard/drag event, if any. */
export function imageFromDataTransfer(items: DataTransferItemList | null): Blob | null {
  if (!items) return null;
  for (const it of Array.from(items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
