import type { SpendDTO } from '@mediagen/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Estudio } from '@/components/Estudio';
import type { StudioItem } from '@/lib/studio';

export interface GenerateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The unit to generate; null closes the workbench. */
  item: StudioItem | null;
  /** Re-fetch the source view after a result is saved/generated. */
  onRefresh: () => void | Promise<void>;
  imageModels?: string[];
  spend?: SpendDTO | null;
  fetchSpend?: () => Promise<SpendDTO>;
}

/**
 * The Estúdio's single-item generation workbench in a dialog, so any view
 * (Pranchas, Storyboard, Elenco) can open the exact same prompt + paste/upload +
 * API-generate UI without leaving the screen.
 */
export function GenerateModal({
  open,
  onOpenChange,
  item,
  onRefresh,
  imageModels,
  spend,
  fetchSpend,
}: GenerateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar{item ? ` — ${item.label}` : ''}</DialogTitle>
        </DialogHeader>
        {item && (
          <Estudio
            items={[item]}
            embedded
            onRefresh={onRefresh}
            imageModels={imageModels}
            spend={spend}
            fetchSpend={fetchSpend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GenerateModal;
