// Simple in-memory async job queue with SSE progress. Single-process by design
// (v1 is single-user, local). Jobs run immediately; subscribers receive
// progress events until the job reaches a terminal state.

import { EventEmitter } from 'node:events';
import type { JobProgress } from '@mediagen/types';
import { newId, nowIso } from '../lib/ids.js';

export interface JobHandle {
  id: string;
  update(progress: number, message: string): void;
}

type Runner = (handle: JobHandle) => Promise<void>;

class JobQueue {
  private jobs = new Map<string, JobProgress>();
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  get(id: string): JobProgress | undefined {
    return this.jobs.get(id);
  }

  /** Create a job and start running it. Returns the job id immediately. */
  start(kind: JobProgress['kind'], runner: Runner): JobProgress {
    const id = newId('job');
    const job: JobProgress = {
      id,
      kind,
      status: 'queued',
      progress: 0,
      message: 'Queued',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.jobs.set(id, job);
    this.emit(job);

    const handle: JobHandle = {
      id,
      update: (progress, message) => {
        const j = this.jobs.get(id);
        if (!j || j.status === 'done' || j.status === 'error') return;
        j.status = 'running';
        j.progress = Math.max(0, Math.min(1, progress));
        j.message = message;
        j.updatedAt = nowIso();
        this.emit(j);
      },
    };

    // Kick off asynchronously so the route can return the job id first.
    queueMicrotask(async () => {
      const j = this.jobs.get(id)!;
      j.status = 'running';
      j.updatedAt = nowIso();
      this.emit(j);
      try {
        await runner(handle);
        const done = this.jobs.get(id)!;
        done.status = 'done';
        done.progress = 1;
        done.message = 'Complete';
        done.updatedAt = nowIso();
        this.emit(done);
      } catch (err) {
        const failed = this.jobs.get(id)!;
        failed.status = 'error';
        failed.message = 'Failed';
        failed.error = err instanceof Error ? err.message : String(err);
        failed.updatedAt = nowIso();
        this.emit(failed);
      }
    });

    return job;
  }

  private emit(job: JobProgress): void {
    this.emitter.emit(job.id, { ...job });
  }

  /** Subscribe to a job's progress. Returns an unsubscribe function. */
  subscribe(id: string, listener: (job: JobProgress) => void): () => void {
    this.emitter.on(id, listener);
    return () => this.emitter.off(id, listener);
  }
}

export const jobQueue = new JobQueue();
