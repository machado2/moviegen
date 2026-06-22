import type { FastifyRequest } from 'fastify';
import { badRequest } from './errors.js';

export interface Upload {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  fields: Record<string, string>;
}

/** Read a single uploaded file plus any text fields from a multipart request. */
export async function readUpload(req: FastifyRequest): Promise<Upload> {
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
  return { buffer, filename, mimetype, fields };
}
