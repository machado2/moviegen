// Durable journal for the job queue. Jobs are transient *operational* state
// (not project content), so they persist as JSON — machine-written/read only,
// and crucially dependency-free at boot (no nickel subprocess per record, which
// must not be on the critical path of starting the server).
//
// The journal exists so a server restart mid-job is visible instead of silent:
// on boot the queue marks any still-"running" record as interrupted, and old
// terminal records are pruned to bound growth.

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { JobProgress } from '@mediagen/types';
import { DATA_DIR } from '../config.js';

const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const jobFile = (id: string): string => path.join(JOBS_DIR, `${id}.json`);

/** Atomically write a job record (tmp file + rename). */
export async function persistJob(job: JobProgress): Promise<void> {
  await fsp.mkdir(JOBS_DIR, { recursive: true });
  const tmp = `${jobFile(job.id)}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(job), 'utf8');
  await fsp.rename(tmp, jobFile(job.id));
}

/** Delete a job record. Missing files are ignored. */
export async function removeJob(id: string): Promise<void> {
  await fsp.rm(jobFile(id), { force: true });
}

/** Load every persisted job record. Unreadable records are skipped. */
export async function loadAllJobs(): Promise<JobProgress[]> {
  let entries: string[];
  try {
    entries = await fsp.readdir(JOBS_DIR);
  } catch {
    return []; // no jobs dir yet
  }
  const jobs: JobProgress[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await fsp.readFile(path.join(JOBS_DIR, name), 'utf8');
      jobs.push(JSON.parse(raw) as JobProgress);
    } catch {
      // corrupt/half-written record — ignore it
    }
  }
  return jobs;
}
