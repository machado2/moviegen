import { useMemo } from 'react';
import { ArrowRight, CircleDot, CircleCheck, Circle } from 'lucide-react';
import type { SpendDTO } from '@mediagen/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { StudioItem } from '@/lib/studio';
import { spendLabel } from '@/lib/cost';

type StageState = 'done' | 'progress' | 'blocked';

interface Stage {
  label: string;
  detail: string;
  state: StageState;
  action?: { label: string; onClick: () => void };
}

export interface PipelineProps {
  items: StudioItem[];
  loading: boolean;
  /** Label for the atomic unit: "Shots" (film) or "Quadros" (HQ). */
  unitLabel: string;
  /** Accumulated LLM spend for this project (null while loading / no calls). */
  spend?: SpendDTO | null;
  onGoRoteiro: () => void;
  onGoStudio: () => void;
  onGoMontagem: () => void;
}

function StageIcon({ state }: { state: StageState }) {
  if (state === 'done') return <CircleCheck className="h-5 w-5 text-emerald-500" />;
  if (state === 'progress') return <CircleDot className="h-5 w-5 text-primary" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

function countBy(items: StudioItem[], pred: (i: StudioItem) => boolean) {
  const total = items.filter(pred).length;
  const done = items.filter((i) => pred(i) && i.done).length;
  return { total, done };
}

export function Pipeline({ items, loading, unitLabel, spend, onGoRoteiro, onGoStudio, onGoMontagem }: PipelineProps) {
  const stages = useMemo<Stage[]>(() => {
    const refs = countBy(items, (i) => i.kind === 'character' || i.kind === 'location');
    const units = countBy(items, (i) => i.kind === 'shot' || i.kind === 'quadro');
    // The parse is what creates the sequence (shots/quadros); use that as the
    // honest signal rather than "any item exists" (references can be added by hand).
    const hasStructure = units.total > 0;

    const refState: StageState = refs.total === 0 ? 'blocked' : refs.done === refs.total ? 'done' : 'progress';
    const unitState: StageState = units.total === 0 ? 'blocked' : units.done === units.total ? 'done' : 'progress';
    const montagemReady = units.total > 0 && units.done === units.total;

    return [
      {
        label: 'Roteiro',
        detail: hasStructure ? 'estrutura criada' : 'carregue um roteiro e parseie com IA',
        state: hasStructure ? 'done' : 'blocked',
        action: { label: 'Abrir', onClick: onGoRoteiro },
      },
      {
        label: 'Personagens & Cenários',
        detail: refs.total ? `${refs.done} / ${refs.total} prontos` : '—',
        state: refState,
        action: refs.total ? { label: 'Produzir', onClick: onGoStudio } : undefined,
      },
      {
        label: unitLabel,
        detail: units.total ? `${units.done} / ${units.total} prontos` : '—',
        state: unitState,
        action: units.total ? { label: 'Produzir', onClick: onGoStudio } : undefined,
      },
      {
        label: 'Montagem',
        detail: montagemReady ? 'pronto para montar' : 'aguardando produção',
        state: montagemReady ? 'progress' : 'blocked',
        action: montagemReady ? { label: 'Montar', onClick: onGoMontagem } : undefined,
      },
    ];
  }, [items, unitLabel, onGoRoteiro, onGoStudio, onGoMontagem]);

  const totalUnits = items.length;
  const doneUnits = items.filter((i) => i.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Pipeline</span>
          {!loading && totalUnits > 0 && (
            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <span>{doneUnits}/{totalUnits} unidades prontas</span>
              <span className="h-3 w-px bg-border" />
              <span title="Custo de IA reportado pelo gateway neste projeto">
                custo IA: {spendLabel(spend)}
                {spend?.capUsd != null && ` / $${spend.capUsd.toFixed(2)}`}
              </span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Calculando estado do projeto…</p>
        ) : (
          <ol className="space-y-1">
            {stages.map((s) => (
              <li key={s.label} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-muted/40">
                <StageIcon state={s.state} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
                {s.action && (
                  <Button variant="ghost" size="sm" onClick={s.action.onClick} className="gap-1">
                    {s.action.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default Pipeline;
