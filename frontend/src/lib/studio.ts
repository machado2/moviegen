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
  /** User marked this unit as skipped (persisted); sinks to the end of the queue. */
  skipped: boolean;
  /** Manual queue ordering within its kind group (lower = earlier); queue-only. */
  queuePriority?: number;
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
  /** Persist the skipped flag for this unit. */
  setSkipped: (skipped: boolean) => Promise<void>;
  /** Persist a manual queue-ordering value for this unit. */
  setPriority: (priority: number) => Promise<void>;
  /** Canonical description (references only) — feeds the prompt; editable in Elenco. */
  description?: string;
  /** Persist an edited canonical description (references only). */
  setDescription?: (description: string) => Promise<void>;
}

/**
 * Queue order: pending-active first, then skipped, then done. Within those,
 * references (characters/locations) come before the sequence (shots/quadros),
 * and a manual `queuePriority` reorders within a kind group (falling back to the
 * build order). Stable on the input order otherwise.
 */
export function orderStudioItems(items: StudioItem[]): StudioItem[] {
  const kindRank: Record<StudioKind, number> = { character: 0, location: 1, shot: 2, quadro: 2 };
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const A = a.it;
      const B = b.it;
      if (A.done !== B.done) return A.done ? 1 : -1; // pending before done
      if (A.skipped !== B.skipped) return A.skipped ? 1 : -1; // skipped sink within their band
      const kr = kindRank[A.kind] - kindRank[B.kind];
      if (kr !== 0) return kr;
      const ap = A.queuePriority ?? a.i;
      const bp = B.queuePriority ?? b.i;
      if (ap !== bp) return ap - bp;
      return a.i - b.i;
    })
    .map((x) => x.it);
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
