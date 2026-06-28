import type { FastifyInstance } from 'fastify';
import type { ParsedScript } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject, toDTO } from '../services/project.js';
import {
  applyParsedScript,
  cancelScriptParse,
  extractRawScenes,
  getActiveParseJob,
  getParsedScript,
  listRawScenes,
  startScriptParse,
  structuredImport,
} from '../services/script.js';
import { readUpload } from '../lib/multipart.js';
import { badRequest } from '../lib/errors.js';

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
    await fs.commitProject(req.params.id, 'roteiro: atualizado');
    return { ok: true, bytes: Buffer.byteLength(markdown) };
  });

  // Parse runs as a background job (it's a multi-minute LLM call). Returns a
  // jobId; the client follows progress over the shared SSE jobs endpoint, then
  // GETs /script/parsed for the result.
  app.post<{ Params: { id: string } }>('/projects/:id/script/parse', async (req, reply) => {
    const job = await startScriptParse(req.params.id);
    return reply.code(202).send({ jobId: job.id, ...job });
  });

  // The parse job currently running for this project, or null. Lets the UI
  // re-attach to an in-flight parse after a reload lost the job id.
  app.get<{ Params: { id: string } }>('/projects/:id/script/parse/active', async (req) =>
    getActiveParseJob(req.params.id),
  );

  // Abort the in-flight parse (user pressed "Abortar"). Aborts the LLM call.
  app.post<{ Params: { id: string } }>('/projects/:id/script/parse/cancel', async (req) => {
    const cancelled = await cancelScriptParse(req.params.id);
    return { cancelled };
  });

  // Raw scenes (source layer): faithful deterministic segmentation of the stored
  // screenplay. POST extracts/re-extracts; GET lists them.
  app.post<{ Params: { id: string } }>('/projects/:id/script/raw-scenes', async (req) =>
    extractRawScenes(req.params.id),
  );
  app.get<{ Params: { id: string } }>('/projects/:id/script/raw-scenes', async (req) =>
    listRawScenes(req.params.id),
  );

  // The pending parsed-but-not-applied script, or null. Lets the UI restore the
  // review/apply step after a reload while a parse was in flight.
  app.get<{ Params: { id: string } }>('/projects/:id/script/parsed', async (req) =>
    getParsedScript(req.params.id),
  );

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
