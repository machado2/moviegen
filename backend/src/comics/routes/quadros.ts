import type { FastifyInstance } from 'fastify';
import {
  addQuadro,
  deleteQuadro,
  reorderQuadros,
  updateQuadro,
  type CreateQuadroInput,
  type UpdateQuadroInput,
} from '../services/prancha.js';
import { quadroPrompt } from '@mediagen/core';
import { getProject } from '../services/project.js';
import { getPrancha } from '../services/prancha.js';
import { badRequest, notFound } from '../../lib/errors.js';

type PranchaParams = { id: string; pranchaId: string };
type QuadroParams = PranchaParams & { quadroId: string };

export async function comicsQuadroRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: PranchaParams; Body: CreateQuadroInput }>(
    '/projects/:id/pranchas/:pranchaId/quadros',
    async (req, reply) => {
      return reply.code(201).send(await addQuadro(req.params.id, req.params.pranchaId, req.body ?? {}));
    },
  );

  app.post<{ Params: PranchaParams; Body: { quadroIds: string[] } }>(
    '/projects/:id/pranchas/:pranchaId/quadros/reorder',
    async (req) => {
      if (!Array.isArray(req.body?.quadroIds)) throw badRequest('quadroIds array required');
      return reorderQuadros(req.params.id, req.params.pranchaId, req.body.quadroIds);
    },
  );

  app.put<{ Params: QuadroParams; Body: UpdateQuadroInput }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId',
    async (req) => updateQuadro(req.params.id, req.params.pranchaId, req.params.quadroId, req.body ?? {}),
  );

  app.delete<{ Params: QuadroParams }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId',
    async (req, reply) => {
      await deleteQuadro(req.params.id, req.params.pranchaId, req.params.quadroId);
      return reply.code(204).send();
    },
  );

  // Prompt preview: assemble and return the full prompt for a quadro.
  app.post<{ Params: QuadroParams }>(
    '/projects/:id/pranchas/:pranchaId/quadros/:quadroId/prompt',
    async (req) => {
      const project = await getProject(req.params.id);
      const prancha = await getPrancha(req.params.id, req.params.pranchaId);
      const quadro = prancha.quadros.find((q) => q.id === req.params.quadroId);
      if (!quadro) throw notFound('Quadro');
      return { prompt: quadroPrompt(project, prancha, quadro) };
    },
  );
}
