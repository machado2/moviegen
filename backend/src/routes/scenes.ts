import type { FastifyInstance } from 'fastify';
import {
  createScene,
  deleteScene,
  getScene,
  listSceneRefs,
  reorderScenes,
  updateScene,
  type CreateSceneInput,
  type UpdateSceneInput,
} from '../services/scene.js';
import { badRequest } from '../lib/errors.js';

export async function sceneRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/projects/:id/scenes', async (req) => {
    return listSceneRefs(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: CreateSceneInput }>('/projects/:id/scenes', async (req, reply) => {
    if (!req.body?.shortTitle) throw badRequest('shortTitle is required');
    return reply.code(201).send(await createScene(req.params.id, req.body));
  });

  app.post<{ Params: { id: string }; Body: { sceneIds: string[] } }>(
    '/projects/:id/scenes/reorder',
    async (req) => {
      if (!Array.isArray(req.body?.sceneIds)) throw badRequest('sceneIds array required');
      return reorderScenes(req.params.id, req.body.sceneIds);
    },
  );

  app.get<{ Params: { id: string; sceneId: string } }>('/projects/:id/scenes/:sceneId', async (req) => {
    return getScene(req.params.id, req.params.sceneId);
  });

  app.put<{ Params: { id: string; sceneId: string }; Body: UpdateSceneInput }>(
    '/projects/:id/scenes/:sceneId',
    async (req) => {
      return updateScene(req.params.id, req.params.sceneId, req.body ?? {});
    },
  );

  app.delete<{ Params: { id: string; sceneId: string } }>(
    '/projects/:id/scenes/:sceneId',
    async (req, reply) => {
      await deleteScene(req.params.id, req.params.sceneId);
      return reply.code(204).send();
    },
  );
}
