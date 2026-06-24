import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../services/settings.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async () => getSettings());

  app.patch<{ Body: { openrouterApiKey?: string | null; parseModel?: string | null; ttsModel?: string | null } }>('/settings', async (req) => {
    return updateSettings(req.body ?? {});
  });
}
