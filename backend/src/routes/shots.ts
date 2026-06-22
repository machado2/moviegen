import type { FastifyInstance } from 'fastify';
import {
  addShot,
  deleteShot,
  reorderShots,
  updateShot,
  type CreateShotInput,
  type UpdateShotInput,
} from '../services/scene.js';
import { badRequest } from '../lib/errors.js';

export async function shotRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string; sceneId: string }; Body: CreateShotInput }>(
    '/projects/:id/scenes/:sceneId/shots',
    async (req, reply) => {
      return reply.code(201).send(await addShot(req.params.id, req.params.sceneId, req.body ?? {}));
    },
  );

  app.post<{ Params: { id: string; sceneId: string }; Body: { shotIds: string[] } }>(
    '/projects/:id/scenes/:sceneId/shots/reorder',
    async (req) => {
      if (!Array.isArray(req.body?.shotIds)) throw badRequest('shotIds array required');
      return reorderShots(req.params.id, req.params.sceneId, req.body.shotIds);
    },
  );

  app.put<{ Params: { id: string; sceneId: string; shotId: string }; Body: UpdateShotInput }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId',
    async (req) => {
      return updateShot(req.params.id, req.params.sceneId, req.params.shotId, req.body ?? {});
    },
  );

  app.delete<{ Params: { id: string; sceneId: string; shotId: string } }>(
    '/projects/:id/scenes/:sceneId/shots/:shotId',
    async (req, reply) => {
      await deleteShot(req.params.id, req.params.sceneId, req.params.shotId);
      return reply.code(204).send();
    },
  );
}
