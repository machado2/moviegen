import { useState } from 'react';
import type { ParsedScript } from '@mediagen/types';
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

export interface ScriptImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsed: ParsedScript | null;
  applying: boolean;
  error: string | null;
  onApply: (parsed: ParsedScript) => void;
}

/**
 * Review modal for an AI-parsed script. Shows the proposed characters and
 * scenes/shots before the user commits with "Apply".
 */
export function ScriptImportModal({
  open,
  onOpenChange,
  parsed,
  applying,
  error,
  onApply,
}: ScriptImportModalProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review parsed script</DialogTitle>
          <DialogDescription>
            Review the structure extracted by the AI. Applying it creates
            scenes, shots, and character assets in this project.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!parsed && (
          <p className="text-sm text-muted-foreground">No parsed script yet.</p>
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
                  Style: {parsed.globalStyle}
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-1 text-sm font-medium">
                Characters ({parsed.characters.length})
              </h4>
              <ul className="space-y-1 text-xs">
                {parsed.characters.map((c) => (
                  <li key={c.id} className="rounded border p-2">
                    <span className="font-mono font-semibold">{c.name}</span>{' '}
                    <span className="text-muted-foreground">({c.id})</span>
                    <p className="text-muted-foreground">{c.description}</p>
                    {c.voiceDescription && (
                      <p className="text-muted-foreground">
                        Voice: {c.voiceDescription}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-1 text-sm font-medium">
                Scenes ({parsed.scenes.length})
              </h4>
              <ul className="space-y-1 text-xs">
                {parsed.scenes.map((s) => (
                  <li key={s.number} className="rounded border p-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left"
                      onClick={() =>
                        setExpanded(expanded === s.number ? null : s.number)
                      }
                    >
                      <span>
                        <span className="font-semibold">#{s.number}</span>{' '}
                        {s.shortTitle}
                      </span>
                      <Badge variant="secondary">
                        {s.shots.length} shots
                      </Badge>
                    </button>
                    {expanded === s.number && (
                      <div className="mt-2 space-y-1">
                        <p className="text-muted-foreground">{s.summary}</p>
                        {s.shots.map((shot) => (
                          <div
                            key={shot.order}
                            className="rounded bg-muted p-2"
                          >
                            <span className="font-medium">
                              Shot {shot.order}
                            </span>{' '}
                            ({shot.targetDuration}) — {shot.camera}
                            <p className="text-muted-foreground">
                              {shot.action}
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
            Cancel
          </Button>
          <Button
            disabled={!parsed || applying}
            onClick={() => parsed && onApply(parsed)}
          >
            {applying ? 'Applying…' : 'Apply to project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScriptImportModal;
