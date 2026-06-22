import type { FastifyInstance } from 'fastify';
import { extname } from 'node:path';
import {
  createAsset,
  deleteAsset,
  getAsset,
  getAssetFileAbsolutePath,
  listAssets,
  updateAsset,
  uploadAssetFile,
  type CreateAssetInput,
  type UpdateAssetInput,
} from '../services/asset.js';
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
}
