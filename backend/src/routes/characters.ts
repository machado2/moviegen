import type { FastifyInstance } from 'fastify';
import { getCharacter, listCharacters } from '../services/asset.js';

export async function characterRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/projects/:id/characters', async (req) => {
    return listCharacters(req.params.id);
  });

  app.get<{ Params: { id: string; charId: string } }>(
    '/projects/:id/characters/:charId',
    async (req) => {
      return getCharacter(req.params.id, req.params.charId);
    },
  );
}
