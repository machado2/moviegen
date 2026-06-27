import type { FastifyInstance } from 'fastify';
import {
  addRender,
  deleteRender,
  getRenderAbsolutePath,
  listRenders,
  selectRender,
} from '../services/render.js';
import { startRenderGeneration } from '../services/assembly.js';
import { readUpload } from '../../lib/multipart.js';
import { sendFileWithRange } from '../../lib/sendfile.js';

type QuadroParams = { id: string; pranchaId: string; quadroId: string };

export async function comicsRenderRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: QuadroParams }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders',
    async (req) => listRenders(req.params.id, req.params.pranchaId, req.params.quadroId),
  );

  app.post<{ Params: QuadroParams }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders',
    async (req, reply) => {
      const { buffer, filename, fields } = await readUpload(req, { kind: 'image' });
      const render = await addRender(req.params.id, req.params.pranchaId, req.params.quadroId, {
        data: buffer,
        originalName: filename,
        source: 'upload',
        notes: fields.notes,
      });
      return reply.code(201).send(render);
    },
  );

  // Generate a render via the LiteLLM gateway (default) or the local codex CLI
  // (only when useCodex is set). Returns a job id; runs async.
  app.post<{ Params: QuadroParams; Body: { model?: string; useCodex?: boolean } }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders/generate',
    async (req, reply) => {
      const job = await startRenderGeneration(req.params.id, req.params.pranchaId, req.params.quadroId, {
        model: req.body?.model,
        useCodex: req.body?.useCodex,
      });
      return reply.code(202).send({ jobId: job.id, ...job });
    },
  );

  app.get<{ Params: QuadroParams & { renderId: string } }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders/:renderId',
    async (req, reply) => {
      const { path } = await getRenderAbsolutePath(
        req.params.id,
        req.params.pranchaId,
        req.params.quadroId,
        req.params.renderId,
      );
      return sendFileWithRange(req, reply, path, 'image/png');
    },
  );

  app.delete<{ Params: QuadroParams & { renderId: string } }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/renders/:renderId',
    async (req, reply) => {
      await deleteRender(req.params.id, req.params.pranchaId, req.params.quadroId, req.params.renderId);
      return reply.code(204).send();
    },
  );

  app.put<{ Params: QuadroParams; Body: { renderId: string | null } }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/selected-render',
    async (req) => {
      const renderId = req.body?.renderId ?? null;
      await selectRender(req.params.id, req.params.pranchaId, req.params.quadroId, renderId);
      return { ok: true, selectedRenderId: renderId };
    },
  );
}
