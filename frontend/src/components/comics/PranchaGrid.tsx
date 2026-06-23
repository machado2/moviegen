import type { Prancha, Quadro } from '@mediagen/types';
import { layoutSlots } from '@/lib/comicsLayout';
import { comicsApi } from '@/api/comicsClient';
import { cn } from '@/lib/utils';

export interface PranchaGridProps {
  projectId: string;
  prancha: Prancha;
  /** which quadro is currently selected/focused, if any */
  activeQuadroId?: string | null;
  onSelectQuadro?: (quadroId: string) => void;
}

/**
 * On-screen visual preview of a prancha following its layout geometry.
 * Each slot shows the quadro's selected render (or a placeholder). This mirrors
 * the backend montage geometry via `layoutSlots`.
 */
export function PranchaGrid({
  projectId,
  prancha,
  activeQuadroId,
  onSelectQuadro,
}: PranchaGridProps) {
  const slots = layoutSlots(prancha.layout);
  const quadros = [...prancha.quadros].sort((a, b) => a.order - b.order);

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border bg-black"
      style={{ aspectRatio: '2 / 3' }}
    >
      {slots.map((slot) => {
        const quadro: Quadro | undefined = quadros[slot.index];
        const selectedRender =
          quadro?.selectedRenderId != null
            ? quadro.renders.find((r) => r.id === quadro.selectedRenderId)
            : undefined;
        const url =
          quadro && selectedRender
            ? comicsApi.renders.imageUrl(
                projectId,
                prancha.id,
                quadro.id,
                selectedRender.id,
              )
            : null;
        const active = quadro != null && quadro.id === activeQuadroId;
        return (
          <button
            key={slot.index}
            type="button"
            disabled={!quadro}
            onClick={() => quadro && onSelectQuadro?.(quadro.id)}
            className={cn(
              'absolute flex items-center justify-center overflow-hidden border border-white/20 text-xs text-white/70 transition-colors',
              active && 'ring-2 ring-primary',
              quadro && 'hover:bg-white/5',
            )}
            style={{
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              width: `${slot.width * 100}%`,
              height: `${slot.height * 100}%`,
            }}
          >
            {url ? (
              <img
                src={url}
                alt={`Q${quadro?.order ?? slot.index + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>
                {quadro ? `Q${quadro.order}` : `slot ${slot.index + 1}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default PranchaGrid;
