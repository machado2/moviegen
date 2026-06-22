import type { FastifyInstance } from 'fastify';
import type { BookFormat, MontagemOptions } from '@moviegen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import {
  getBookStatus,
  pranchaStatus,
  startBookAssembly,
  startPranchaAssembly,
} from '../services/assembly.js';
import { jobQueue } from '../../jobs/queue.js';
import { sendFileWithRange } from '../../lib/sendfile.js';
import { isBookFormat } from '../assembly/book.js';
import { badRequest, notFound } from '../../lib/errors.js';

const FORMAT_MIME: Record<BookFormat, string> = {
  cbz: 'application/vnd.comicbook+zip',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
};

export async function comicsAssemblyRoutes(app: FastifyInstance): Promise<void> {
  // ─── Prancha montage ────────────────────────────────────────────────────
  app.post<{ Params: { id: string; pranchaId: string }; Body: Partial<MontagemOptions> }>(
    '/projects/:id/pranchas/:pranchaId/assemble',
    async (req, reply) => {
      const job = await startPranchaAssembly(req.params.id, req.params.pranchaId, req.body ?? {});
      return reply.code(202).send({ jobId: job.id, ...job });
    },
  );

  app.get<{ Params: { id: string; pranchaId: string } }>(
    '/projects/:id/pranchas/:pranchaId/assembly',
    async (req) => pranchaStatus(req.params.id, req.params.pranchaId),
  );

  app.get<{ Params: { id: string; pranchaId: string } }>(
    '/projects/:id/pranchas/:pranchaId/output',
    async (req, reply) => {
      const path = cfs.pranchaOutputFile(req.params.id, req.params.pranchaId);
      if (!(await fs.pathExists(path))) throw notFound('Assembled prancha output');
      return sendFileWithRange(req, reply, path, 'image/png');
    },
  );

  // ─── Book ───────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/projects/:id/assembly', async (req) => getBookStatus(req.params.id));

  app.post<{ Params: { id: string }; Body: { formats?: BookFormat[] } }>(
    '/projects/:id/assemble',
    async (req, reply) => {
      const formats = (req.body?.formats ?? []).filter(isBookFormat);
      const job = await startBookAssembly(req.params.id, formats);
      return reply.code(202).send({ jobId: job.id, ...job });
    },
  );

  app.get<{ Params: { id: string; format: string } }>('/projects/:id/output/:format', async (req, reply) => {
    if (!isBookFormat(req.params.format)) throw badRequest('format must be cbz, pdf, or epub');
    const path = cfs.bookOutputFile(req.params.id, req.params.format);
    if (!(await fs.pathExists(path))) throw notFound(`Assembled ${req.params.format}`);
    reply.header('Content-Disposition', `attachment; filename="book.${req.params.format}"`);
    return sendFileWithRange(req, reply, path, FORMAT_MIME[req.params.format]);
  });

  // ─── Job progress (SSE) — shared in-memory queue ─────────────────────────
  app.get<{ Params: { id: string; jobId: string } }>(
    '/projects/:id/jobs/:jobId/progress',
    async (req, reply) => {
      const job = jobQueue.get(req.params.jobId);
      if (!job) throw notFound('Job');
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (j: typeof job) => {
        reply.raw.write(`data: ${JSON.stringify(j)}\n\n`);
        if (j.status === 'done' || j.status === 'error') reply.raw.end();
      };
      send(job);
      if (job.status === 'done' || job.status === 'error') return reply;
      const unsubscribe = jobQueue.subscribe(req.params.jobId, send);
      req.raw.on('close', unsubscribe);
      return reply;
    },
  );
}
