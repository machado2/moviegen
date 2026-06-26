// Read/write routes for the co-creation artifacts: the outline/beat sheet and
// the chat transcript. The streaming co-creation agent endpoint is added on top
// of these in TASK-10.3.

import type { FastifyInstance } from 'fastify';
import type { Outline } from '@mediagen/types';
import type { UIMessage } from 'ai';
import { clearChatThread, getChatThread, getOutline, saveOutline } from '../services/cocreate.js';
import { runCoCreateTurn } from '../services/cocreateAgent.js';
import { badRequest } from '../lib/errors.js';

export async function cocreateRoutes(app: FastifyInstance): Promise<void> {
  // Streaming co-creation turn. Body is { messages: UIMessage[] } (the Vercel AI
  // SDK useChat shape). Streams the AI SDK UI-message protocol so the frontend's
  // useChat consumes it natively; the turn's exchange is persisted on finish.
  app.post<{ Params: { id: string }; Body: { messages?: UIMessage[] } }>(
    '/projects/:id/cocreate/chat',
    async (req, reply) => {
      const messages = req.body?.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        throw badRequest('Provide { messages: UIMessage[] } with at least one message');
      }
      // Abort the model run if the client disconnects before the stream finishes
      // (e.g. the "Parar" button aborts the fetch). Listen on the *response*
      // socket — req.raw 'close' fires as soon as Fastify finishes reading the
      // body, which would abort every turn immediately.
      const ac = new AbortController();
      // Hand the raw Node response to the SDK; Fastify must not also send one.
      reply.hijack();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) ac.abort();
      });

      const turn = await runCoCreateTurn({ projectId: req.params.id, uiMessages: messages, signal: ac.signal });
      turn.pipe(reply.raw);
      return reply;
    },
  );

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
