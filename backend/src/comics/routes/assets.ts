import type { FastifyInstance } from 'fastify';
import { extname } from 'node:path';
import {
  createAsset,
  deleteAsset,
  deleteAssetVariant,
  getAsset,
  getAssetFileAbsolutePath,
  getAssetVariantAbsolutePath,
  listAssets,
  listAssetVariants,
  selectAssetVariant,
  updateAsset,
  uploadAssetFile,
  type CreateAssetInput,
  type UpdateAssetInput,
} from '../services/asset.js';
import { startCharacterImageGeneration } from '../services/assembly.js';
import { readUpload } from '../../lib/multipart.js';
import { badRequest } from '../../lib/errors.js';
import * as fs from '../../storage/filesystem.js';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

export async function comicsAssetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/projects/:id/assets', async (req) => listAssets(req.params.id));

  app.post<{ Params: { id: string }; Body: CreateAssetInput }>('/projects/:id/assets', async (req, reply) => {
    if (!req.body?.role) throw badRequest('role is required');
    return reply.code(201).send(await createAsset(req.params.id, req.body));
  });

  app.get<{ Params: { id: string; assetId: string } }>('/projects/:id/assets/:assetId', async (req) => {
    return getAsset(req.params.id, req.params.assetId);
  });

  app.put<{ Params: { id: string; assetId: string }; Body: UpdateAssetInput }>(
    '/projects/:id/assets/:assetId',
    async (req) => updateAsset(req.params.id, req.params.assetId, req.body ?? {}),
  );

  app.delete<{ Params: { id: string; assetId: string } }>('/projects/:id/assets/:assetId', async (req, reply) => {
    await deleteAsset(req.params.id, req.params.assetId);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string; assetId: string } }>('/projects/:id/assets/:assetId/upload', async (req) => {
    const { buffer, filename } = await readUpload(req);
    return uploadAssetFile(req.params.id, req.params.assetId, buffer, filename);
  });

  app.get<{ Params: { id: string; assetId: string } }>('/projects/:id/assets/:assetId/file', async (req, reply) => {
    const { path } = await getAssetFileAbsolutePath(req.params.id, req.params.assetId);
    reply.header('Content-Type', MIME[extname(path).toLowerCase()] ?? 'application/octet-stream');
    return reply.send(fs.createReadStream(path));
  });

  // ─── Variants (generated/uploaded candidates; the user picks the keeper) ──────
  app.get<{ Params: { id: string; assetId: string } }>(
    '/projects/:id/assets/:assetId/variants',
    async (req) => listAssetVariants(req.params.id, req.params.assetId),
  );

  app.put<{ Params: { id: string; assetId: string }; Body: { variantId: string | null } }>(
    '/projects/:id/assets/:assetId/selected-variant',
    async (req) => selectAssetVariant(req.params.id, req.params.assetId, req.body?.variantId ?? null),
  );

  app.delete<{ Params: { id: string; assetId: string; variantId: string } }>(
    '/projects/:id/assets/:assetId/variants/:variantId',
    async (req) => deleteAssetVariant(req.params.id, req.params.assetId, req.params.variantId),
  );

  app.get<{ Params: { id: string; assetId: string; variantId: string } }>(
    '/projects/:id/assets/:assetId/variants/:variantId',
    async (req, reply) => {
      const { path } = await getAssetVariantAbsolutePath(req.params.id, req.params.assetId, req.params.variantId);
      reply.header('Content-Type', MIME[extname(path).toLowerCase()] ?? 'application/octet-stream');
      return reply.send(fs.createReadStream(path));
    },
  );

  // Generate a character reference image via the gateway. Returns a job id.
  app.post<{ Params: { id: string; assetId: string }; Body: { model?: string; prompt?: string } }>(
    '/projects/:id/assets/:assetId/generate-image',
    async (req, reply) => {
      const job = await startCharacterImageGeneration(req.params.id, req.params.assetId, {
        model: req.body?.model,
        prompt: req.body?.prompt,
      });
      return reply.code(202).send({ jobId: job.id, ...job });
    },
  );
}
