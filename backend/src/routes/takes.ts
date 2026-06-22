import type { FastifyInstance } from 'fastify';
import {
  addTake,
  deleteTake,
  getTakeAbsolutePath,
  listTakes,
  selectTake,
} from '../services/take.js';
import { readUpload } from '../lib/multipart.js';
import { sendFileWithRange } from '../lib/sendfile.js';

type ShotParams = { id: string; sceneId: string; shotId: string };

export async function takeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: ShotParams }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId/takes',
    async (req) => {
      return listTakes(req.params.id, req.params.sceneId, req.params.shotId);
    },
  );

  app.post<{ Params: ShotParams }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId/takes',
    async (req, reply) => {
      const { buffer, filename, fields } = await readUpload(req);
      const take = await addTake(req.params.id, req.params.sceneId, req.params.shotId, {
        data: buffer,
        originalName: filename,
        source: fields.source === 'generated' ? 'generated' : 'upload',
        generationPrompt: fields.generationPrompt,
        notes: fields.notes,
      });
      return reply.code(201).send(take);
    },
  );

  app.get<{ Params: ShotParams & { takeId: string } }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId/takes/:takeId',
    async (req, reply) => {
      const { path } = await getTakeAbsolutePath(
        req.params.id,
        req.params.sceneId,
        req.params.shotId,
        req.params.takeId,
      );
      return sendFileWithRange(req, reply, path, 'video/mp4');
    },
  );

  app.delete<{ Params: ShotParams & { takeId: string } }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId/takes/:takeId',
    async (req, reply) => {
      await deleteTake(req.params.id, req.params.sceneId, req.params.shotId, req.params.takeId);
      return reply.code(204).send();
    },
  );

  app.put<{ Params: ShotParams; Body: { takeId: string | null } }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId/selected-take',
    async (req) => {
      const takeId = req.body?.takeId ?? null;
      await selectTake(req.params.id, req.params.sceneId, req.params.shotId, takeId);
      return { ok: true, selectedTakeId: takeId };
    },
  );
}
