import type { JobProgress } from '@moviegen/types';
import { Badge } from '@/components/ui/badge';

export interface AssemblyProgressProps {
  job: JobProgress;
}

function statusVariant(
  status: JobProgress['status'],
): 'default' | 'success' | 'destructive' | 'secondary' {
  switch (status) {
    case 'done':
      return 'success';
    case 'error':
      return 'destructive';
    case 'running':
      return 'default';
    default:
      return 'secondary';
  }
}

export function AssemblyProgress({ job }: AssemblyProgressProps) {
  const pct = Math.round(job.progress * 100);
  return (
    <div className="space-y-1 rounded-md border p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{job.kind}</span>
        <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted-foreground">
        {job.error ?? job.message} ({pct}%)
      </p>
    </div>
  );
}

export default AssemblyProgress;
