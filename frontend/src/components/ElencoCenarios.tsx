import { useEffect, useMemo, useState } from 'react';
import { ImageOff, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { StudioItem } from '@/lib/studio';

export interface ElencoCenariosProps {
  items: StudioItem[];
  loading: boolean;
  /** Open the Estúdio focused on this unit. */
  onProduce: (key: string) => void;
  /** Re-fetch after an edit persists. */
  onRefresh: () => void | Promise<void>;
}

function statusLabel(it: StudioItem): { text: string; cls: string } {
  if (it.done) return { text: 'pronto', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' };
  if (it.skipped) return { text: 'pulado', cls: 'bg-muted text-muted-foreground/70' };
  return { text: 'pendente', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
}

function Card({ item, onProduce, onRefresh }: { item: StudioItem; onProduce: () => void; onRefresh: () => void | Promise<void> }) {
  const [desc, setDesc] = useState(item.description ?? '');
  const [saving, setSaving] = useState(false);
  // Keep local text in sync if the underlying value changes (e.g. after refresh).
  useEffect(() => {
    setDesc(item.description ?? '');
  }, [item.description]);

  const status = statusLabel(item);

  const saveDesc = async () => {
    if (!item.setDescription || desc === (item.description ?? '')) return;
    setSaving(true);
    try {
      await item.setDescription(desc);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex gap-3">
        <div
          className={cn(
            'flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border',
            item.done ? 'border-emerald-500/40' : 'border-dashed border-muted-foreground/30 bg-muted/30',
          )}
        >
          {item.done && item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt={item.label} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">{item.sublabel}</p>
          <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', status.cls)}>
            {status.text}
          </span>
        </div>
      </div>

      {item.setDescription && (
        <div>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => void saveDesc()}
            placeholder="Descrição canônica (aparência, idade, figurino…)"
            className="min-h-[60px] text-sm"
          />
          {saving && <p className="text-[10px] text-muted-foreground">salvando…</p>}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onProduce} className="gap-1 self-start">
        <Wand2 className="h-3.5 w-3.5" /> {item.done ? 'Refazer no Estúdio' : 'Produzir'}
      </Button>
    </div>
  );
}

function Section({ title, items, onProduce, onRefresh }: { title: string; items: StudioItem[]; onProduce: (k: string) => void; onRefresh: () => void | Promise<void> }) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">· {done}/{items.length} prontos</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Card key={it.key} item={it} onProduce={() => onProduce(it.key)} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

export function ElencoCenarios({ items, loading, onProduce, onRefresh }: ElencoCenariosProps) {
  const personagens = useMemo(() => items.filter((i) => i.kind === 'character'), [items]);
  const cenarios = useMemo(() => items.filter((i) => i.kind === 'location'), [items]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando elenco…</p>;
  if (personagens.length === 0 && cenarios.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum personagem ou cenário ainda. Carregue um roteiro e parseie com IA.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Personagens" items={personagens} onProduce={onProduce} onRefresh={onRefresh} />
      <Section title="Cenários" items={cenarios} onProduce={onProduce} onRefresh={onRefresh} />
    </div>
  );
}

export default ElencoCenarios;
