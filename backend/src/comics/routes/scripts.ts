import type { FastifyInstance } from 'fastify';
import type { ParsedComicsScript } from '@moviegen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, toDTO } from '../services/project.js';
import { parseComicsScript } from '../services/ai.js';
import { applyParsedComicsScript, structuredImport } from '../services/script.js';
import { readUpload } from '../../lib/multipart.js';
import { badRequest, notFound } from '../../lib/errors.js';

export async function comicsScriptRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>('/projects/:id/script', async (req) => {
    await getProject(req.params.id);
    let markdown: string;
    if (req.isMultipart()) {
      markdown = (await readUpload(req)).buffer.toString('utf8');
    } else if (typeof req.body === 'string') {
      markdown = req.body;
    } else if (req.body && typeof (req.body as { content?: string }).content === 'string') {
      markdown = (req.body as { content: string }).content;
    } else {
      throw badRequest('Provide the screenplay as a file upload or { content } JSON');
    }
    await fs.writeText(cfs.scriptFile(req.params.id), markdown);
    return { ok: true, bytes: Buffer.byteLength(markdown) };
  });

  app.post<{ Params: { id: string } }>('/projects/:id/script/parse', async (req) => {
    const project = await getProject(req.params.id);
    if (!(await fs.pathExists(cfs.scriptFile(req.params.id)))) throw notFound('Stored screenplay');
    const markdown = await fs.readText(cfs.scriptFile(req.params.id));
    return parseComicsScript(project, markdown);
  });

  app.post<{ Params: { id: string }; Body: ParsedComicsScript }>('/projects/:id/script/apply', async (req) => {
    if (!req.body || typeof req.body !== 'object') throw badRequest('ParsedComicsScript body required');
    return toDTO(await applyParsedComicsScript(req.params.id, req.body));
  });

  app.post<{ Params: { id: string } }>('/projects/:id/structured-import', async (req) => {
    return toDTO(await structuredImport(req.params.id, req.body));
  });
}
