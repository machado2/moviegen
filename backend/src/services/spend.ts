// Per-project LLM spend ledger. The LiteLLM gateway reports the real cost of
// each completion (header `x-litellm-response-cost`) plus token usage; we
// accumulate those into a `spend.ncl` next to the project so the cost stays
// visible and a configurable cap can pause generation.
//
// Medium-agnostic: callers pass the project's directory (film and comics
// projects live under different roots). Recording and the UI summary are
// best-effort — they must NEVER break a generation, so reads there fall back to
// zero and writes swallow errors. The CAP CHECK, by contrast, is the actual
// ceiling, so it is fail-closed: a ledger that exists but can't be read blocks
// paid generation instead of silently uncapping the project.

import path from 'node:path';
import type { SpendDTO } from '@mediagen/types';
import { HttpError } from '../lib/errors.js';
import * as fs from '../storage/filesystem.js';

export interface SpendLedger {
  /** Sum of known per-call costs (USD). */
  totalUsd: number;
  /** Calls whose cost the gateway actually reported. */
  billedCalls: number;
  /** Calls where no cost came back (cost unknown, shown as "—"). */
  unbilledCalls: number;
  promptTokens: number;
  completionTokens: number;
}

/** One LLM call's measured usage. Any field may be unknown. */
export interface SpendRecord {
  costUsd: number | null;
  promptTokens?: number;
  completionTokens?: number;
}

const ZERO: SpendLedger = {
  totalUsd: 0,
  billedCalls: 0,
  unbilledCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
};

function spendFile(projectDir: string): string {
  return path.join(projectDir, 'spend.ncl');
}

function normalizeLedger(stored: Partial<SpendLedger>): SpendLedger {
  return {
    totalUsd: stored.totalUsd ?? 0,
    billedCalls: stored.billedCalls ?? 0,
    unbilledCalls: stored.unbilledCalls ?? 0,
    promptTokens: stored.promptTokens ?? 0,
    completionTokens: stored.completionTokens ?? 0,
  };
}

/**
 * Best-effort read for recording and the UI summary. A missing file is
 * legitimately zero; a corrupt/unreadable file ALSO falls back to zero so spend
 * tracking and the dashboard never break a generation. Do NOT use this on the
 * cap path — see `readForCap`.
 */
async function read(projectDir: string): Promise<SpendLedger> {
  const file = spendFile(projectDir);
  if (!(await fs.pathExists(file))) return { ...ZERO };
  try {
    return normalizeLedger(await fs.readNickel<Partial<SpendLedger>>(file));
  } catch {
    // A corrupt/partial ledger must not break recording or the UI — read zero.
    return { ...ZERO };
  }
}

/**
 * Fail-closed read for the cap check. A MISSING ledger is legitimately zero,
 * but a ledger that EXISTS yet can't be read/parsed must BLOCK paid generation
 * rather than silently disabling the cap (the old behavior, where a corrupt
 * file read as zero and uncapped the project).
 */
async function readForCap(projectDir: string, capUsd: number): Promise<SpendLedger> {
  const file = spendFile(projectDir);
  if (!(await fs.pathExists(file))) return { ...ZERO };
  try {
    return normalizeLedger(await fs.readNickel<Partial<SpendLedger>>(file));
  } catch {
    throw new HttpError(
      402,
      'Não foi possível ler o registro de gastos (spend.ncl): o arquivo existe mas está corrompido ou ilegível. ' +
        `Por segurança a geração paga foi bloqueada, para não ignorar o teto de US$ ${capUsd.toFixed(2)}. ` +
        'Corrija ou remova o arquivo spend.ncl do projeto para voltar a gerar.',
    );
  }
}

function capReachedError(totalUsd: number, capUsd: number): HttpError {
  return new HttpError(
    402,
    `Teto de gasto atingido: já foram gastos US$ ${totalUsd.toFixed(4)} (limite US$ ${capUsd.toFixed(2)}). ` +
      'Aumente ou remova o teto em Configurações para continuar gerando.',
  );
}

/** Add one call's usage to a project's ledger. Best-effort; never throws. */
export async function recordSpend(projectDir: string, rec: SpendRecord): Promise<void> {
  try {
    const ledger = await read(projectDir);
    const hasCost = rec.costUsd != null && Number.isFinite(rec.costUsd);
    const next: SpendLedger = {
      totalUsd: ledger.totalUsd + (hasCost ? rec.costUsd! : 0),
      billedCalls: ledger.billedCalls + (hasCost ? 1 : 0),
      unbilledCalls: ledger.unbilledCalls + (hasCost ? 0 : 1),
      promptTokens: ledger.promptTokens + (rec.promptTokens ?? 0),
      completionTokens: ledger.completionTokens + (rec.completionTokens ?? 0),
    };
    await fs.writeNickel(spendFile(projectDir), next);
  } catch {
    /* best-effort: spend tracking must never block a generation */
  }
}

/** A project's spend summary for the API/UI, given the global cap (or null). */
export async function getSpend(projectDir: string, capUsd: number | null): Promise<SpendDTO> {
  const l = await read(projectDir);
  return {
    totalUsd: l.totalUsd,
    hasCost: l.billedCalls > 0,
    promptTokens: l.promptTokens,
    completionTokens: l.completionTokens,
    calls: l.billedCalls + l.unbilledCalls,
    capUsd,
    capReached: capUsd != null && l.totalUsd >= capUsd,
  };
}

/**
 * Throw if this project has already reached the spend cap. A cheap pre-check;
 * the real ceiling is `withSpendGuard`, which re-checks under a per-project lock
 * so a burst of concurrent jobs can't all sail past a still-near-zero ledger.
 * No-op when no cap is configured. Fail-closed on a corrupt ledger.
 */
export async function assertUnderCap(projectDir: string, capUsd: number | null): Promise<void> {
  if (capUsd == null) return;
  const l = await readForCap(projectDir, capUsd);
  if (l.totalUsd >= capUsd) throw capReachedError(l.totalUsd, capUsd);
}

// Per-project mutex. Each guarded section chains onto the previous one for the
// same projectDir, so the check→call→record critical section runs one at a time
// per project and every queued call sees its predecessor's recorded cost. The
// map self-prunes when a project has no in-flight guarded calls.
const projectLocks = new Map<string, Promise<void>>();

/**
 * Run a paid gateway call as the body of the per-project spend critical section.
 *
 * When a cap is set, this acquires the project's lock, RE-READS the ledger
 * inside the lock (fail-closed on corruption), throws the 402 HttpError if the
 * project is already at/over the cap, runs `fn` (the gateway call, which should
 * also record its cost before returning so the next queued call sees it), then
 * releases the lock. Serializing per project is what turns the cap from a weak
 * pre-call check — which N concurrent jobs could all pass while the ledger was
 * ~0 — into a real ceiling.
 *
 * When `capUsd` is null the project is unlimited, so we do NOT serialize: `fn`
 * runs immediately without taking the lock.
 *
 * `estimateUsd` is an OPTIONAL per-call cost estimate. When provided, the
 * in-lock check also rejects if `recorded + estimate > cap` (a reservation), so
 * a call that would clearly blow the cap is refused before it bills. Real call
 * sites have no reliable estimate (e.g. video has no catalog price), so they
 * omit it; without it a single in-flight call can still exceed the cap by its
 * own (unknowable-in-advance) cost — serialization guarantees only ONE such
 * overshoot, never N×.
 */
export async function withSpendGuard<T>(
  projectDir: string,
  capUsd: number | null,
  fn: () => Promise<T>,
  estimateUsd?: number | null,
): Promise<T> {
  // Unlimited project: never serialize, just run.
  if (capUsd == null) return fn();

  const prev = projectLocks.get(projectDir) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The new tail resolves only once our gate is released, so the next caller
  // waits for us. A predecessor's rejection must not block us, hence the catch.
  const tail = prev.then(() => gate);
  projectLocks.set(projectDir, tail);
  await prev.catch(() => {});

  try {
    const l = await readForCap(projectDir, capUsd);
    if (l.totalUsd >= capUsd) throw capReachedError(l.totalUsd, capUsd);
    if (estimateUsd != null && Number.isFinite(estimateUsd) && l.totalUsd + estimateUsd > capUsd) {
      throw new HttpError(
        402,
        `Teto de gasto seria ultrapassado: já foram gastos US$ ${l.totalUsd.toFixed(4)} e esta geração ` +
          `custaria cerca de US$ ${estimateUsd.toFixed(4)} (limite US$ ${capUsd.toFixed(2)}). ` +
          'Aumente ou remova o teto em Configurações para continuar gerando.',
      );
    }
    return await fn();
  } finally {
    release();
    // Drop the entry if nobody queued behind us, so the map doesn't grow.
    if (projectLocks.get(projectDir) === tail) projectLocks.delete(projectDir);
  }
}
