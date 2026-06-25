import type { FastifyInstance } from 'fastify';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  toDTO,
  updateProject,
  type UpdateProjectInput,
} from '../services/project.js';
import { exportProjectZip, importProjectZip } from '../services/archive.js';
import { getSpend } from '../services/spend.js';
import { getSpendCap } from '../services/settings.js';
import * as fs from '../storage/filesystem.js';
import { readUpload } from '../lib/multipart.js';
import { badRequest } from '../lib/errors.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.post('/projects', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string; language?: string; globalStyle?: string };
    if (!body.title || typeof body.title !== 'string') throw badRequest('title is required');
    const project = await createProject({ title: body.title, language: body.language, globalStyle: body.globalStyle });
    return reply.code(201).send(toDTO(project));
  });

  app.get('/projects', async () => listProjects());

  app.get<{ Params: { id: string } }>('/projects/:id', async (req) => {
    return toDTO(await getProject(req.params.id));
  });

  app.put<{ Params: { id: string }; Body: UpdateProjectInput }>('/projects/:id', async (req) => {
    return toDTO(await updateProject(req.params.id, req.body ?? {}));
  });

  app.delete<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    await deleteProject(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/projects/:id/export', async (req, reply) => {
    const stream = await exportProjectZip(req.params.id);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${req.params.id}.zip"`);
    return reply.send(stream);
  });

  app.post('/projects/import', async (req, reply) => {
    const { buffer } = await readUpload(req);
    const project = await importProjectZip(buffer);
    return reply.code(201).send(toDTO(project));
  });

  // Version history (per-project git log), newest first.
  app.get<{ Params: { id: string } }>('/projects/:id/history', async (req) => {
    await getProject(req.params.id);
    return fs.projectHistory(req.params.id);
  });

  // Restore the project to an earlier commit (recorded as a new commit).
  app.post<{ Params: { id: string }; Body: { hash?: string } }>('/projects/:id/restore', async (req) => {
    await getProject(req.params.id);
    const hash = (req.body ?? {}).hash;
    if (!hash || typeof hash !== 'string') throw badRequest('hash is required');
    await fs.restoreProject(req.params.id, hash);
    return toDTO(await getProject(req.params.id));
  });

  // Accumulated LLM spend for this project (cost is only ever the gateway's own
  // reported figure; "—" in the UI when it never reported one).
  app.get<{ Params: { id: string } }>('/projects/:id/spend', async (req) => {
    await getProject(req.params.id);
    return getSpend(fs.projectDir(req.params.id), await getSpendCap());
  });
}
