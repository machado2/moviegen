import type { FastifyInstance } from 'fastify';
import { comicsProjectRoutes } from './projects.js';
import { comicsScriptRoutes } from './scripts.js';
import { comicsCharacterRoutes } from './characters.js';
import { comicsAssetRoutes } from './assets.js';
import { comicsPranchaRoutes } from './pranchas.js';
import { comicsQuadroRoutes } from './quadros.js';
import { comicsRenderRoutes } from './renders.js';
import { comicsAssemblyRoutes } from './assembly.js';

/** All ComicsGen routes. Mounted by the server under /api/v1/comics. */
export async function comicsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(comicsProjectRoutes);
  await app.register(comicsScriptRoutes);
  await app.register(comicsCharacterRoutes);
  await app.register(comicsAssetRoutes);
  await app.register(comicsPranchaRoutes);
  await app.register(comicsQuadroRoutes);
  await app.register(comicsRenderRoutes);
  await app.register(comicsAssemblyRoutes);
}
