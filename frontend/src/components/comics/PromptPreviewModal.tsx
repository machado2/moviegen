import { Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface PromptPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  prompt: string | null;
  loading: boolean;
  error: string | null;
}

/** Shows the server-assembled quadro prompt with a copy-to-clipboard button. */
export function PromptPreviewModal({
  open,
  onOpenChange,
  title,
  prompt,
  loading,
  error,
}: PromptPreviewModalProps) {
  const copy = () => {
    if (prompt) void navigator.clipboard.writeText(prompt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {loading && (
          <p className="text-sm text-muted-foreground">Montando prompt…</p>
        )}
        {error && (
          <p className="rounded border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && (
          <>
            <Textarea
              value={prompt ?? ''}
              readOnly
              className="h-[50vh] font-mono text-xs"
            />
            <Button onClick={copy} disabled={!prompt}>
              <Copy className="h-4 w-4" /> Copiar para a área de transferência
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PromptPreviewModal;
