import type { FastifyInstance } from 'fastify';
import * as fs from '../storage/filesystem.js';
import {
  getMovieStatus,
  sceneStatus,
  startMovieAssembly,
  startSceneAssembly,
} from '../services/assembly.js';
import { jobQueue } from '../jobs/queue.js';
import { sendFileWithRange } from '../lib/sendfile.js';
import { notFound } from '../lib/errors.js';

export async function assemblyRoutes(app: FastifyInstance): Promise<void> {
  // ─── Scene assembly ─────────────────────────────────────────────────────
  app.post<{ Params: { id: string; sceneId: string } }>(
    '/projects/:id/scenes/:sceneId/assemble',
    async (req, reply) => {
      const job = await startSceneAssembly(req.params.id, req.params.sceneId);
      return reply.code(202).send({ jobId: job.id, ...job });
    },
  );

  app.get<{ Params: { id: string; sceneId: string } }>(
    '/projects/:id/scenes/:sceneId/assembly',
    async (req) => sceneStatus(req.params.id, req.params.sceneId),
  );

  app.get<{ Params: { id: string; sceneId: string } }>(
    '/projects/:id/scenes/:sceneId/output',
    async (req, reply) => {
      const path = fs.sceneOutputFile(req.params.id, req.params.sceneId);
      if (!(await fs.pathExists(path))) throw notFound('Assembled scene output');
      return sendFileWithRange(req, reply, path, 'video/mp4');
    },
  );

  // ─── Movie assembly ─────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/projects/:id/assembly', async (req) => {
    return getMovieStatus(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/projects/:id/assemble', async (req, reply) => {
    const job = await startMovieAssembly(req.params.id);
    return reply.code(202).send({ jobId: job.id, ...job });
  });

  app.get<{ Params: { id: string } }>('/projects/:id/output', async (req, reply) => {
    const path = fs.movieOutputFile(req.params.id);
    if (!(await fs.pathExists(path))) throw notFound('Assembled movie output');
    return sendFileWithRange(req, reply, path, 'video/mp4');
  });

  // ─── Job status (one-shot) ──────────────────────────────────────────────
  // Lets the client reconcile after a dropped SSE stream (a generation may have
  // finished/failed server-side while the live connection was gone).
  app.get<{ Params: { id: string; jobId: string } }>('/projects/:id/jobs/:jobId', async (req) => {
    const job = jobQueue.get(req.params.jobId);
    if (!job) throw notFound('Job');
    return job;
  });

  // ─── Job progress (SSE) ─────────────────────────────────────────────────
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

      // Emit current state immediately, then subscribe to updates.
      send(job);
      if (job.status === 'done' || job.status === 'error') return reply;

      const unsubscribe = jobQueue.subscribe(req.params.jobId, send);
      req.raw.on('close', unsubscribe);
      return reply;
    },
  );
}
