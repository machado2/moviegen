import type { FastifyInstance } from 'fastify';
import type { AllProjectSummary } from '@mediagen/types';
import { listProjects as listFilmProjects } from '../services/project.js';
import { listProjects as listComicsProjects } from '../comics/services/project.js';

export async function allProjectsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/all-projects', async (): Promise<AllProjectSummary[]> => {
    const [films, comics] = await Promise.all([listFilmProjects(), listComicsProjects()]);
    const all: AllProjectSummary[] = [
      ...films.map((p) => ({ id: p.id, title: p.title, type: 'film' as const, language: p.language, updatedAt: p.updatedAt })),
      ...comics.map((p) => ({ id: p.id, title: p.title, type: 'comics' as const, language: p.language, updatedAt: p.updatedAt })),
    ];
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return all;
  });
}
