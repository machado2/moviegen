// Per-project LLM spend ledger. The LiteLLM gateway reports the real cost of
// each completion (header `x-litellm-response-cost`) plus token usage; we
// accumulate those into a `spend.ncl` next to the project so the cost stays
// visible and a configurable cap can pause generation.
//
// Medium-agnostic: callers pass the project's directory (film and comics
// projects live under different roots). Everything here is best-effort —
// tracking cost must NEVER break or block an actual generation, so reads fall
// back to zero and writes swallow errors.

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

async function read(projectDir: string): Promise<SpendLedger> {
  const file = spendFile(projectDir);
  if (!(await fs.pathExists(file))) return { ...ZERO };
  try {
    const stored = await fs.readNickel<Partial<SpendLedger>>(file);
    return {
      totalUsd: stored.totalUsd ?? 0,
      billedCalls: stored.billedCalls ?? 0,
      unbilledCalls: stored.unbilledCalls ?? 0,
      promptTokens: stored.promptTokens ?? 0,
      completionTokens: stored.completionTokens ?? 0,
    };
  } catch {
    // A corrupt/partial ledger must not break generation — start fresh.
    return { ...ZERO };
  }
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
 * Throw if this project has already reached the spend cap. Called before each
 * paid LLM call so an external client can never overshoot the ceiling. No-op
 * when no cap is configured.
 */
export async function assertUnderCap(projectDir: string, capUsd: number | null): Promise<void> {
  if (capUsd == null) return;
  const l = await read(projectDir);
  if (l.totalUsd >= capUsd) {
    throw new HttpError(
      402,
      `Teto de gasto atingido: já foram gastos US$ ${l.totalUsd.toFixed(4)} (limite US$ ${capUsd.toFixed(2)}). ` +
        'Aumente ou remova o teto em Configurações para continuar gerando.',
    );
  }
}
