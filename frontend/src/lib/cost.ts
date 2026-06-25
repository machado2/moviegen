import type { SpendDTO } from '@mediagen/types';

/** Format a USD amount with enough precision for tiny per-call LLM costs. */
export function formatUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

/**
 * Project AI cost as a display string. Returns "—" when the gateway never
 * reported a cost — we never invent a number (see TASK-1 AC#4).
 */
export function spendLabel(spend: SpendDTO | null | undefined): string {
  if (!spend || !spend.hasCost) return '—';
  return formatUsd(spend.totalUsd);
}
