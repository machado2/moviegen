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
import { getProject } from '../services/project.js';
import { generateImagePrompt } from '../services/ai.js';
import { startAssetImageGeneration } from '../services/assetgen.js';
import { readUpload } from '../lib/multipart.js';
import { badRequest } from '../lib/errors.js';
import * as fs from '../storage/filesystem.js';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/projects/:id/assets', async (req) => {
    return listAssets(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: CreateAssetInput }>('/projects/:id/assets', async (req, reply) => {
    const body = req.body;
    if (!body || !body.type || !body.role) throw badRequest('type and role are required');
    return reply.code(201).send(await createAsset(req.params.id, body));
  });

  app.get<{ Params: { id: string; assetId: string } }>('/projects/:id/assets/:assetId', async (req) => {
    return getAsset(req.params.id, req.params.assetId);
  });

  app.put<{ Params: { id: string; assetId: string }; Body: UpdateAssetInput }>(
    '/projects/:id/assets/:assetId',
    async (req) => {
      return updateAsset(req.params.id, req.params.assetId, req.body ?? {});
    },
  );

  app.delete<{ Params: { id: string; assetId: string } }>('/projects/:id/assets/:assetId', async (req, reply) => {
    await deleteAsset(req.params.id, req.params.assetId);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string; assetId: string } }>(
    '/projects/:id/assets/:assetId/upload',
    async (req) => {
      const { buffer, filename } = await readUpload(req, { kind: 'image' });
      return uploadAssetFile(req.params.id, req.params.assetId, buffer, filename);
    },
  );

  app.get<{ Params: { id: string; assetId: string } }>(
    '/projects/:id/assets/:assetId/file',
    async (req, reply) => {
      const { path } = await getAssetFileAbsolutePath(req.params.id, req.params.assetId);
      reply.header('Content-Type', MIME[extname(path).toLowerCase()] ?? 'application/octet-stream');
      return reply.send(fs.createReadStream(path));
    },
  );

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

  // Auto-generate: for image/location assets, generate an image-gen prompt via
  // the LLM and store it on the asset. (v1 does not call image APIs directly.)
  app.post<{ Params: { id: string; assetId: string } }>(
    '/projects/:id/assets/:assetId/generate',
    async (req) => {
      const project = await getProject(req.params.id);
      const asset = await getAsset(req.params.id, req.params.assetId);
      const kind = asset.role === 'location' ? 'location' : 'character';
      const name = asset.characterName || asset.description || asset.id;
      const subject = [
        `Name: ${name}`,
        asset.description && asset.description !== name ? `Brief: ${asset.description}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      if (asset.type === 'image') {
        const prompt = await generateImagePrompt(project, subject, kind);
        return updateAsset(req.params.id, req.params.assetId, { prompt });
      }
      // Voice/audio generation would call a TTS API; not wired in v1.
      throw badRequest('Direct generation for this asset type is not available in v1; upload a file instead');
    },
  );

  // Generate the reference image itself via the LiteLLM gateway. Returns a job
  // id; runs async (the result is saved as the asset's file).
  app.post<{ Params: { id: string; assetId: string }; Body: { model?: string; prompt?: string } }>(
    '/projects/:id/assets/:assetId/generate-image',
    async (req, reply) => {
      const job = await startAssetImageGeneration(req.params.id, req.params.assetId, {
        model: req.body?.model,
        prompt: req.body?.prompt,
      });
      return reply.code(202).send({ jobId: job.id, ...job });
    },
  );
}
