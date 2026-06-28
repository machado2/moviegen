import type { FastifyInstance } from 'fastify';
import {
  createPrancha,
  deletePrancha,
  getPrancha,
  listPranchaRefs,
  reorderPranchas,
  updatePrancha,
  type CreatePranchaInput,
  type UpdatePranchaInput,
} from '../services/prancha.js';
import { badRequest } from '../../lib/errors.js';
import { isLayout } from '../layout.js';

function isRenderMode(value: unknown): value is 'panels' | 'page' {
  return value === 'panels' || value === 'page';
}

export async function comicsPranchaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/projects/:id/pranchas', async (req) => listPranchaRefs(req.params.id));

  app.post<{ Params: { id: string }; Body: CreatePranchaInput }>('/projects/:id/pranchas', async (req, reply) => {
    const body = req.body;
    if (!body?.shortTitle) throw badRequest('shortTitle is required');
    if (!isLayout(body.layout)) throw badRequest('valid layout is required');
    if (body.renderMode !== undefined && !isRenderMode(body.renderMode)) throw badRequest('invalid renderMode');
    return reply.code(201).send(await createPrancha(req.params.id, body));
  });

  app.post<{ Params: { id: string }; Body: { pranchaIds: string[] } }>(
    '/projects/:id/pranchas/reorder',
    async (req) => {
      if (!Array.isArray(req.body?.pranchaIds)) throw badRequest('pranchaIds array required');
      return reorderPranchas(req.params.id, req.body.pranchaIds);
    },
  );

  app.get<{ Params: { id: string; pranchaId: string } }>('/projects/:id/pranchas/:pranchaId', async (req) => {
    return getPrancha(req.params.id, req.params.pranchaId);
  });

  app.put<{ Params: { id: string; pranchaId: string }; Body: UpdatePranchaInput }>(
    '/projects/:id/pranchas/:pranchaId',
    async (req) => {
      if (req.body?.layout !== undefined && !isLayout(req.body.layout)) throw badRequest('invalid layout');
      if (req.body?.renderMode !== undefined && !isRenderMode(req.body.renderMode)) throw badRequest('invalid renderMode');
      return updatePrancha(req.params.id, req.params.pranchaId, req.body ?? {});
    },
  );

  app.delete<{ Params: { id: string; pranchaId: string } }>(
    '/projects/:id/pranchas/:pranchaId',
    async (req, reply) => {
      await deletePrancha(req.params.id, req.params.pranchaId);
      return reply.code(204).send();
    },
  );
}
