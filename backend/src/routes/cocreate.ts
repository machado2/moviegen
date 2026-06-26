// Read/write routes for the co-creation artifacts: the outline/beat sheet and
// the chat transcript. The streaming co-creation agent endpoint is added on top
// of these in TASK-10.3.

import type { FastifyInstance } from 'fastify';
import type { Outline } from '@mediagen/types';
import { clearChatThread, getChatThread, getOutline, saveOutline } from '../services/cocreate.js';

export async function cocreateRoutes(app: FastifyInstance): Promise<void> {
  // The current outline (empty shape if none written yet).
  app.get<{ Params: { id: string } }>('/projects/:id/outline', async (req) => {
    return getOutline(req.params.id);
  });

  // Replace the outline wholesale (the UI edits it; the agent uses finer tools).
  app.put<{ Params: { id: string }; Body: Outline }>('/projects/:id/outline', async (req) => {
    return saveOutline(req.params.id, req.body);
  });

  // The co-creation chat transcript.
  app.get<{ Params: { id: string } }>('/projects/:id/cocreate/chat', async (req) => {
    return getChatThread(req.params.id);
  });

  // Wipe the transcript (the outline is kept).
  app.delete<{ Params: { id: string } }>('/projects/:id/cocreate/chat', async (req) => {
    return clearChatThread(req.params.id);
  });
}
