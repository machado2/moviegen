import { useEffect, useRef, useState } from 'react';
import type { ParsedComicsScript } from '@mediagen/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ParseLogEntry {
  time: number;
  message: string;
}

export interface ScriptImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsed: ParsedComicsScript | null;
  applying: boolean;
  error: string | null;
  onApply: (parsed: ParsedComicsScript) => void;
  /** While a parse job runs: 0..1 progress and a status message. */
  parsing?: boolean;
  progress?: number;
  progressMessage?: string;
  parseLogs?: ParseLogEntry[];
}

/**
 * Review modal for an AI-parsed comics script. Shows the proposed characters
 * and pranchas/quadros before the user commits with "Aplicar".
 */
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function ScriptImportModal({
  open,
  onOpenChange,
  parsed,
  applying,
  error,
  onApply,
  parsing = false,
  progress = 0,
  parseLogs = [],
}: ScriptImportModalProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const elapsed = useElapsedSeconds(parsing);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [parseLogs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Revisar roteiro parseado</DialogTitle>
          <DialogDescription>
            Revise a estrutura extraída pela IA. Aplicá-la cria as pranchas,
            quadros e personagens neste projeto.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {parsing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Parseando roteiro com IA…</span>
              <span className="tabular-nums">{fmtElapsed(elapsed)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="max-h-36 overflow-y-auto rounded border bg-muted/50 p-2 font-mono text-xs">
              {parseLogs.length === 0 ? (
                <p className="text-muted-foreground">Iniciando…</p>
              ) : (
                parseLogs.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">{fmtTime(entry.time)}</span>
                    <span>{entry.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
            <p className="text-xs text-muted-foreground">
              Roda no servidor — fechar esta janela não cancela o parse.
            </p>
          </div>
        )}

        {!parsing && !parsed && (
          <p className="text-sm text-muted-foreground">
            Nenhum roteiro parseado ainda.
          </p>
        )}

        {parsed && (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            <div>
              <h3 className="text-sm font-semibold">
                {parsed.title}{' '}
                <Badge variant="outline">{parsed.language}</Badge>
              </h3>
              {parsed.globalStyle && (
                <p className="text-xs text-muted-foreground">
                  Estilo: {parsed.globalStyle}
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-1 text-sm font-medium">
                Personagens ({parsed.characters.length})
              </h4>
              <ul className="space-y-1 text-xs">
                {parsed.characters.map((c) => (
                  <li key={c.id} className="rounded border p-2">
                    <span className="font-mono font-semibold">{c.name}</span>{' '}
                    <span className="text-muted-foreground">({c.id})</span>
                    <p className="text-muted-foreground">{c.description}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-1 text-sm font-medium">
                Pranchas ({parsed.pranchas.length})
              </h4>
              <ul className="space-y-1 text-xs">
                {parsed.pranchas.map((p) => (
                  <li key={p.number} className="rounded border p-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left"
                      onClick={() =>
                        setExpanded(expanded === p.number ? null : p.number)
                      }
                    >
                      <span>
                        <span className="font-semibold">#{p.number}</span>{' '}
                        {p.shortTitle}{' '}
                        <Badge variant="outline">{p.layout}</Badge>
                      </span>
                      <Badge variant="secondary">
                        {p.quadros.length} quadros
                      </Badge>
                    </button>
                    {expanded === p.number && (
                      <div className="mt-2 space-y-1">
                        {p.origin && (
                          <p className="text-muted-foreground">{p.origin}</p>
                        )}
                        {p.quadros.map((q) => (
                          <div key={q.order} className="rounded bg-muted p-2">
                            <span className="font-medium">
                              Quadro {q.order}
                            </span>{' '}
                            <span className="text-muted-foreground">
                              ({q.slotFormat})
                            </span>
                            <p className="text-muted-foreground">
                              {q.composition}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancelar
          </Button>
          <Button
            disabled={!parsed || applying}
            onClick={() => parsed && onApply(parsed)}
          >
            {applying ? 'Aplicando…' : 'Aplicar ao projeto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScriptImportModal;
