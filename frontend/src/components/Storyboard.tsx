import { useMemo, useState } from 'react';
import { Film, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioItem } from '@/lib/studio';

export interface StoryboardProps {
  items: StudioItem[];
  loading: boolean;
  /** Jump to this unit in the Estúdio (produce / redo). */
  onProduce: (key: string) => void;
}

function Cell({ item, onProduce, onView }: { item: StudioItem; onProduce: () => void; onView: () => void }) {
  const click = () => {
    if (item.done && item.thumbnailUrl) onView();
    else onProduce();
  };
  return (
    <button
      type="button"
      onClick={click}
      title={`${item.label}${item.sublabel ? ` · ${item.sublabel}` : ''}`}
      className="group flex flex-col gap-1 text-left"
    >
      <div
        className={cn(
          'relative flex aspect-square items-center justify-center overflow-hidden rounded-md border',
          item.done ? 'border-emerald-500/40' : 'border-dashed border-muted-foreground/30 bg-muted/30',
        )}
      >
        {item.done && item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.label} className="h-full w-full object-cover" />
        ) : item.done ? (
          <Film className="h-6 w-6 text-emerald-500" />
        ) : (
          <ImageOff className="h-6 w-6 text-muted-foreground/50" />
        )}
        <span
          className={cn(
            'absolute right-1 top-1 rounded px-1 text-[10px] font-medium',
            item.done ? 'bg-emerald-500/80 text-white' : 'bg-background/80 text-muted-foreground',
          )}
        >
          {item.done ? 'pronto' : 'produzir'}
        </span>
      </div>
      <span className="truncate text-xs">{item.label}</span>
    </button>
  );
}

function Section({ title, items, onProduce, onView }: { title: string; items: StudioItem[]; onProduce: (k: string) => void; onView: (i: StudioItem) => void }) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">· {done}/{items.length}</span>
      </h3>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {items.map((it) => (
          <Cell key={it.key} item={it} onProduce={() => onProduce(it.key)} onView={() => onView(it)} />
        ))}
      </div>
    </div>
  );
}

export function Storyboard({ items, loading, onProduce }: StoryboardProps) {
  const [view, setView] = useState<{ url: string; label: string } | null>(null);
  const refs = useMemo(() => items.filter((i) => i.kind === 'character' || i.kind === 'location'), [items]);
  const units = useMemo(() => items.filter((i) => i.kind === 'shot' || i.kind === 'quadro'), [items]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando storyboard…</p>;
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nada para mostrar ainda. Carregue um roteiro e parseie com IA.
      </div>
    );
  }

  const onView = (i: StudioItem) => {
    if (i.thumbnailUrl) setView({ url: i.thumbnailUrl, label: i.label });
  };

  return (
    <div className="space-y-6">
      <Section title="Personagens & Cenários" items={refs} onProduce={onProduce} onView={onView} />
      <Section title="Sequência" items={units} onProduce={onProduce} onView={onView} />

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setView(null)}>
          <div className="max-h-full max-w-2xl overflow-auto rounded-lg bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-medium">{view.label}</p>
            <img src={view.url} alt={view.label} className="max-h-[70vh] w-auto rounded" />
          </div>
        </div>
      )}
    </div>
  );
}

export default Storyboard;
