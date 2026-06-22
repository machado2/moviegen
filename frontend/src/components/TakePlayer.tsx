import { useState } from 'react';
import type { Take } from '@moviegen/types';
import { Check, Play, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

export interface TakePlayerProps {
  projectId: string;
  sceneId: string;
  shotId: string;
  take: Take;
  selected: boolean;
  onSelect: (takeId: string | null) => void;
  onDelete: (takeId: string) => void;
}

export function TakePlayer({
  projectId,
  sceneId,
  shotId,
  take,
  selected,
  onSelect,
  onDelete,
}: TakePlayerProps) {
  const [open, setOpen] = useState(false);
  const src = api.takes.streamUrl(projectId, sceneId, shotId, take.id);

  return (
    <div
      className={cn(
        'rounded-md border p-2 text-xs',
        selected ? 'border-green-600 bg-green-50' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono">{take.id.slice(0, 10)}</span>
        {selected && (
          <Badge variant="success" className="gap-1">
            <Check className="h-3 w-3" /> selected
          </Badge>
        )}
        <Badge variant="secondary">{take.source}</Badge>
        {take.durationSeconds != null && (
          <span className="text-muted-foreground">
            {take.durationSeconds.toFixed(1)}s
          </span>
        )}
      </div>

      {open && (
        <video
          src={src}
          controls
          autoPlay
          className="mt-2 max-h-48 w-full rounded bg-black"
        />
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
        >
          <Play className="h-3 w-3" /> {open ? 'Hide' : 'Play'}
        </Button>
        <Button
          size="sm"
          variant={selected ? 'secondary' : 'default'}
          onClick={() => onSelect(selected ? null : take.id)}
        >
          <Star className="h-3 w-3" />
          {selected ? 'Deselect' : 'Select'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(take.id)}
          title="Delete take"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default TakePlayer;
