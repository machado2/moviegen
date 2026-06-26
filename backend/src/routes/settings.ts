import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../services/settings.js';
import { getModelCatalog } from '../services/catalog.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async () => getSettings());

  // Searchable model catalog for the Settings UI (cached upstream list).
  app.get('/models/catalog', async () => getModelCatalog());

  app.patch<{
    Body: {
      llmApiKey?: string | null;
      parseModel?: string | null;
      ttsModel?: string | null;
      spendCapUsd?: number | null;
      llmModels?: string[] | null;
      imageModels?: string[] | null;
      videoModels?: string[] | null;
    };
  }>('/settings', async (req) => {
    return updateSettings(req.body ?? {});
  });
}
