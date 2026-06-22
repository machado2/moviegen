import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { statFile } from '../storage/filesystem.js';
import { notFound } from './errors.js';

/** Stream a file with HTTP Range support so video players can seek. */
export async function sendFileWithRange(
  req: FastifyRequest,
  reply: FastifyReply,
  filePath: string,
  contentType: string,
): Promise<void> {
  const stat = await statFile(filePath);
  if (!stat) throw notFound('File');
  const total = stat.size;
  const range = req.headers.range;

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', contentType);

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : total - 1;
    if (start >= total || end >= total || start > end) {
      reply.header('Content-Range', `bytes */${total}`);
      return reply.code(416).send();
    }
    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
    reply.header('Content-Length', end - start + 1);
    return reply.send(createReadStream(filePath, { start, end }));
  }

  reply.header('Content-Length', total);
  return reply.send(createReadStream(filePath));
}
