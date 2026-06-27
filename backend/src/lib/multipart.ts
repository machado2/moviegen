import type { FastifyRequest } from 'fastify';
import { badRequest } from './errors.js';

export interface Upload {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  fields: Record<string, string>;
}

/** What kind of file a route expects. `either` accepts images or videos. */
export type UploadKind = 'image' | 'video' | 'either';

export interface ReadUploadOptions {
  /** When set, the upload's mimetype and extension are validated against this kind. */
  kind?: UploadKind;
}

// Small allowlists of common types/extensions we actually handle.
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/m4v']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * Reject early (400) when the uploaded file's mimetype OR extension does not match
 * the expected kind, so a bad file fails here instead of deep inside ffmpeg/assembly.
 */
function validateKind(kind: UploadKind, filename: string, mimetype: string): void {
  if (kind === 'either') {
    validateAgainst(filename, mimetype, [
      { mimes: IMAGE_MIMES, exts: IMAGE_EXTS },
      { mimes: VIDEO_MIMES, exts: VIDEO_EXTS },
    ], 'uma imagem ou vídeo (png, jpg, webp, mp4, mov…)');
    return;
  }
  if (kind === 'image') {
    validateAgainst(filename, mimetype, [{ mimes: IMAGE_MIMES, exts: IMAGE_EXTS }],
      'uma imagem (png, jpg, jpeg, webp, gif)');
    return;
  }
  validateAgainst(filename, mimetype, [{ mimes: VIDEO_MIMES, exts: VIDEO_EXTS }],
    'um vídeo (mp4, mov, webm, m4v)');
}

function validateAgainst(
  filename: string,
  mimetype: string,
  groups: Array<{ mimes: Set<string>; exts: Set<string> }>,
  expectation: string,
): void {
  const ext = extensionOf(filename);
  const mime = mimetype.toLowerCase();
  const okMime = groups.some((g) => g.mimes.has(mime));
  const okExt = groups.some((g) => g.exts.has(ext));
  if (!okMime || !okExt) {
    throw badRequest(`Arquivo inválido: esperado ${expectation}.`);
  }
}

/** Read a single uploaded file plus any text fields from a multipart request. */
export async function readUpload(req: FastifyRequest, options: ReadUploadOptions = {}): Promise<Upload> {
  if (!req.isMultipart()) throw badRequest('Expected multipart/form-data');
  let buffer: Buffer | undefined;
  let filename = 'upload.bin';
  let mimetype = 'application/octet-stream';
  const fields: Record<string, string> = {};

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      buffer = await part.toBuffer();
      filename = part.filename || filename;
      mimetype = part.mimetype || mimetype;
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  if (!buffer) throw badRequest('No file uploaded');
  if (options.kind) validateKind(options.kind, filename, mimetype);
  return { buffer, filename, mimetype, fields };
}
