import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HOST, PORT, PUBLIC_DIR } from './config.js';
import * as storage from './storage/filesystem.js';
import { HttpError } from './lib/errors.js';
import type { ApiError } from '@mediagen/types';

import { projectRoutes } from './routes/projects.js';
import { scriptRoutes } from './routes/scripts.js';
import { characterRoutes } from './routes/characters.js';
import { assetRoutes } from './routes/assets.js';
import { sceneRoutes } from './routes/scenes.js';
import { shotRoutes } from './routes/shots.js';
import { takeRoutes } from './routes/takes.js';
import { assemblyRoutes } from './routes/assembly.js';
import { comicsRoutes } from './comics/routes/index.js';
import * as comicsStorage from './comics/storage.js';

async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 50 * 1024 * 1024, // 50MB JSON bodies (structured imports can be large)
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB video uploads
  });

  // Accept text/markdown bodies for raw script upload.
  app.addContentTypeParser(
    ['text/markdown', 'text/plain'],
    { parseAs: 'string' },
    (_req, body, done) => done(null, body),
  );

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) {
      const body: ApiError = { error: err.message, details: err.details };
      return reply.code(err.statusCode).send(body);
    }
    // Fastify validation / multipart errors carry a statusCode.
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    if (status >= 500) app.log.error(err);
    const body: ApiError = { error: message || 'Internal Server Error' };
    return reply.code(status).send(body);
  });

  // All API routes under /api/v1.
  await app.register(
    async (api) => {
      await api.register(projectRoutes);
      await api.register(scriptRoutes);
      await api.register(characterRoutes);
      await api.register(assetRoutes);
      await api.register(sceneRoutes);
      await api.register(shotRoutes);
      await api.register(takeRoutes);
      await api.register(assemblyRoutes);
      api.get('/health', async () => ({ ok: true }));
    },
    { prefix: '/api/v1' },
  );

  // ComicsGen (HQ / graphic novels) shares the same server under /api/v1/comics.
  await app.register(comicsRoutes, { prefix: '/api/v1/comics' });

  // Serve the built frontend (if present) with SPA fallback.
  if (existsSync(PUBLIC_DIR)) {
    await app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' } satisfies ApiError);
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(`Frontend build not found at ${PUBLIC_DIR}; serving API only`);
  }

  return app;
}

async function main() {
  await storage.init();
  await comicsStorage.init();
  const app = await buildServer();
  try {
    await app.listen({ host: HOST, port: PORT });
    app.log.info(`MediaGen listening on http://${HOST}:${PORT} (data: ${path.resolve(process.env.DATA_DIR ?? './data')})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
