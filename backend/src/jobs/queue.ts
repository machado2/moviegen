// Simple in-memory async job queue with SSE progress. Single-process by design
// (v1 is single-user, local). Jobs run immediately; subscribers receive
// progress events until the job reaches a terminal state.
//
// Job state is also journaled to disk (see ./store) so a server restart is
// visible rather than silent: on boot, recover() flips any record still marked
// running to an "interrupted" error, and prunes old terminal records. The
// in-memory map is bounded the same way so a long-lived process doesn't leak.

import { EventEmitter } from 'node:events';
import type { JobProgress } from '@mediagen/types';
import { newId, nowIso } from '../lib/ids.js';
import { loadAllJobs, persistJob, removeJob } from './store.js';

export interface JobHandle {
  id: string;
  update(progress: number, message: string): void;
  /** Aborts when the job is cancelled; pass to long-running fetches. */
  signal: AbortSignal;
}

type Runner = (handle: JobHandle) => Promise<void>;

// How long a finished (done/error) job is retained, in memory and on disk,
// before pruning. Long enough for a user to come back and see a recent result.
const TERMINAL_TTL_MS = 6 * 60 * 60 * 1000;

const isTerminal = (j: JobProgress): boolean => j.status === 'done' || j.status === 'error';

class JobQueue {
  private jobs = new Map<string, JobProgress>();
  // Maps an opaque caller "ref" (e.g. `comics-parse:<projectId>`) to the id of
  // its currently-active (queued/running) job, so callers can dedupe and the
  // UI can re-attach to an in-flight job after a reload lost the job id.
  private activeByRef = new Map<string, string>();
  // Per-job abort controllers, so cancel() can interrupt in-flight work (e.g. a
  // long LLM fetch). Dropped when the job reaches a terminal state.
  private controllers = new Map<string, AbortController>();
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  get(id: string): JobProgress | undefined {
    return this.jobs.get(id);
  }

  /** The active (queued/running) job for a ref, if any. */
  findActiveByRef(ref: string): JobProgress | undefined {
    const id = this.activeByRef.get(ref);
    return id ? this.jobs.get(id) : undefined;
  }

  /**
   * Reload journaled jobs after a restart. Any job still marked running/queued
   * was killed with the previous process — there's no way to resume in-process
   * work, so mark it errored ("interrupted") and keep it queryable instead of
   * 404ing. Old terminal records are pruned. Call once at startup.
   */
  async recover(): Promise<void> {
    for (const job of await loadAllJobs()) {
      if (!isTerminal(job)) {
        job.status = 'error';
        job.message = 'Interrupted';
        job.error = 'Interrupted by a server restart';
        job.updatedAt = nowIso();
        void persistJob(job).catch(() => {});
      }
      this.jobs.set(job.id, job);
    }
    await this.sweep();
  }

  /** Drop terminal jobs older than the TTL from memory and disk. */
  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (isTerminal(job) && now - Date.parse(job.updatedAt) > TERMINAL_TTL_MS) {
        this.jobs.delete(id);
        await removeJob(id).catch(() => {});
      }
    }
  }

  /**
   * Create a job and start running it. Returns the job id immediately. If `ref`
   * is given and already has an active job, that existing job is returned
   * instead of starting a duplicate.
   */
  start(kind: JobProgress['kind'], runner: Runner, ref?: string): JobProgress {
    if (ref) {
      const existing = this.findActiveByRef(ref);
      if (existing) return existing;
    }
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
    if (ref) this.activeByRef.set(ref, id);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.persist(job);
    this.emit(job);

    const cleanup = () => {
      if (ref && this.activeByRef.get(ref) === id) this.activeByRef.delete(ref);
      this.controllers.delete(id);
    };

    const handle: JobHandle = {
      id,
      signal: controller.signal,
      update: (progress, message) => {
        const j = this.jobs.get(id);
        if (!j || isTerminal(j)) return;
        j.status = 'running';
        j.progress = Math.max(0, Math.min(1, progress));
        j.message = message;
        j.updatedAt = nowIso();
        // Progress ticks stay in memory; disk only needs to know it's running.
        this.emit(j);
      },
    };

    // Kick off asynchronously so the route can return the job id first.
    queueMicrotask(async () => {
      const j = this.jobs.get(id)!;
      j.status = 'running';
      j.updatedAt = nowIso();
      this.persist(j); // journal the running state so a crash is detectable
      this.emit(j);
      try {
        await runner(handle);
        const done = this.jobs.get(id)!;
        // cancel() may have raced in and already marked it terminal — respect that.
        if (!isTerminal(done)) {
          done.status = 'done';
          done.progress = 1;
          done.message = 'Complete';
          done.updatedAt = nowIso();
          cleanup();
          this.persist(done);
          this.emit(done);
        }
      } catch (err) {
        const failed = this.jobs.get(id)!;
        // If cancel() already set the terminal "Cancelado" state, don't clobber it.
        if (!isTerminal(failed)) {
          failed.status = 'error';
          failed.message = 'Failed';
          failed.error = err instanceof Error ? err.message : String(err);
          failed.updatedAt = nowIso();
          cleanup();
          this.persist(failed);
          this.emit(failed);
        }
      }
      void this.sweep();
    });

    return job;
  }

  /**
   * Cancel a queued/running job: abort its in-flight work and mark it terminal
   * ("Cancelado"). No-op if the job is unknown or already finished. Returns
   * whether a cancellation actually happened.
   */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || isTerminal(job)) return false;
    this.controllers.get(id)?.abort();
    for (const [ref, jid] of this.activeByRef) if (jid === id) this.activeByRef.delete(ref);
    this.controllers.delete(id);
    job.status = 'error';
    job.message = 'Cancelado';
    job.error = 'Cancelado pelo usuário';
    job.updatedAt = nowIso();
    this.persist(job);
    this.emit(job);
    return true;
  }

  /** Fire-and-forget journal write; persistence must never break a job. */
  private persist(job: JobProgress): void {
    void persistJob({ ...job }).catch(() => {});
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
