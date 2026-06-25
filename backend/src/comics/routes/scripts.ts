import type { FastifyInstance } from 'fastify';
import type { ParsedComicsScript } from '@mediagen/types';
import * as cfs from '../storage.js';
import * as fs from '../../storage/filesystem.js';
import { getProject, toDTO } from '../services/project.js';
import {
  applyParsedComicsScript,
  cancelScriptParse,
  getActiveParseJob,
  getParsedScript,
  startScriptParse,
  structuredImport,
} from '../services/script.js';
import { readUpload } from '../../lib/multipart.js';
import { badRequest } from '../../lib/errors.js';

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
    await cfs.commitProject(req.params.id, 'roteiro: atualizado');
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

  // The pending parsed-but-not-applied script, or null. Lets the UI restore the
  // review/apply step after a reload while a parse was in flight.
  app.get<{ Params: { id: string } }>('/projects/:id/script/parsed', async (req) =>
    getParsedScript(req.params.id),
  );

  app.post<{ Params: { id: string }; Body: ParsedComicsScript }>('/projects/:id/script/apply', async (req) => {
    if (!req.body || typeof req.body !== 'object') throw badRequest('ParsedComicsScript body required');
    return toDTO(await applyParsedComicsScript(req.params.id, req.body));
  });

  app.post<{ Params: { id: string } }>('/projects/:id/structured-import', async (req) => {
    return toDTO(await structuredImport(req.params.id, req.body));
  });
}
