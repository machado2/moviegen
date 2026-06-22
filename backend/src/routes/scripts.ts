import type { FastifyInstance } from 'fastify';
import type { ParsedScript } from '@moviegen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, toDTO } from '../services/project.js';
import { parseScript } from '../services/ai.js';
import { applyParsedScript, structuredImport } from '../services/script.js';
import { readUpload } from '../lib/multipart.js';
import { badRequest, notFound } from '../lib/errors.js';

export async function scriptRoutes(app: FastifyInstance): Promise<void> {
  // Upload a markdown screenplay (stored raw, not parsed).
  app.post<{ Params: { id: string } }>('/projects/:id/script', async (req) => {
    await getProject(req.params.id); // existence check
    let markdown: string;
    if (req.isMultipart()) {
      const { buffer } = await readUpload(req);
      markdown = buffer.toString('utf8');
    } else if (typeof req.body === 'string') {
      markdown = req.body;
    } else if (req.body && typeof (req.body as { content?: string }).content === 'string') {
      markdown = (req.body as { content: string }).content;
    } else {
      throw badRequest('Provide the screenplay as a file upload or { content } JSON');
    }
    await fs.writeText(fs.scriptFile(req.params.id), markdown);
    return { ok: true, bytes: Buffer.byteLength(markdown) };
  });

  // Parse the stored screenplay with AI into a ParsedScript.
  app.post<{ Params: { id: string } }>('/projects/:id/script/parse', async (req) => {
    const project = await getProject(req.params.id);
    if (!(await fs.pathExists(fs.scriptFile(req.params.id)))) {
      throw notFound('Stored screenplay');
    }
    const markdown = await fs.readText(fs.scriptFile(req.params.id));
    return parseScript(project, markdown);
  });

  // Apply a reviewed ParsedScript to the project.
  app.post<{ Params: { id: string }; Body: ParsedScript }>('/projects/:id/script/apply', async (req) => {
    if (!req.body || typeof req.body !== 'object') throw badRequest('ParsedScript body required');
    const project = await applyParsedScript(req.params.id, req.body);
    return toDTO(project);
  });

  // Import a Project-shaped JSON directly (skips AI parsing) into this project.
  app.post<{ Params: { id: string } }>('/projects/:id/structured-import', async (req) => {
    const project = await structuredImport(req.params.id, req.body);
    return toDTO(project);
  });
}
