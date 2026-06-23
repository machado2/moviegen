import type { Render } from '@mediagen/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export interface RenderViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  render: Render | null;
  imageUrl: string | null;
}

/** Modal that displays a render image at a larger size with its metadata. */
export function RenderViewer({
  open,
  onOpenChange,
  render,
  imageUrl,
}: RenderViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">
              {render?.id.slice(0, 12) ?? 'Render'}
            </span>
            {render && <Badge variant="secondary">{render.source}</Badge>}
            {render?.widthPx != null && render?.heightPx != null && (
              <span className="text-xs font-normal text-muted-foreground">
                {render.widthPx}×{render.heightPx}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={render?.id ?? 'render'}
            className="max-h-[70vh] w-full rounded bg-muted object-contain"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No image.</p>
        )}
        {render?.notes && (
          <p className="text-xs text-muted-foreground">{render.notes}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RenderViewer;
