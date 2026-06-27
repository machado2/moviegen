import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { ModelCatalogEntry } from '@mediagen/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ModelPurpose = 'text' | 'image' | 'audio';

/** Model id without any trailing " key=value" params (e.g. quality=low). */
function baseId(value: string): string {
  return value.trim().split(/\s+/)[0] ?? '';
}

function priceLabel(m: ModelCatalogEntry): string {
  if (m.pricing.completion != null) return `$${(m.pricing.completion * 1e6).toFixed(2)}/Mtok`;
  if (m.pricing.image != null) return `$${m.pricing.image}/img`;
  return '';
}

export type ModelPurposeExt = ModelPurpose | 'video';

export interface ModelComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Filters the catalog to models that output this modality. */
  purpose: ModelPurposeExt;
  catalog: ModelCatalogEntry[];
  placeholder?: string;
  id?: string;
  /** Known ids to suggest even when absent from the catalog (e.g. video models). */
  knownIds?: string[];
}

/**
 * A searchable model picker: free-text input (so the wildcard gateway can still
 * take any slug, incl. params) backed by the upstream catalog for suggestions,
 * pricing and a validity hint.
 */
export function ModelCombobox({ value, onChange, purpose, catalog, placeholder, id, knownIds }: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pool = useMemo(() => {
    const fromCatalog = catalog.filter((m) => m.outputModalities.includes(purpose));
    if (!knownIds?.length) return fromCatalog;
    // Suggest known ids that the upstream catalog doesn't list (e.g. video models).
    const have = new Set(fromCatalog.map((m) => m.id));
    const synthetic: ModelCatalogEntry[] = knownIds
      .filter((id) => !have.has(id))
      .map((id) => ({
        id,
        name: id,
        inputModalities: ['text'],
        outputModalities: [purpose],
        contextLength: null,
        pricing: { prompt: null, completion: null, image: null, request: null },
      }));
    return [...synthetic, ...fromCatalog];
  }, [catalog, purpose, knownIds]);

  const matches = useMemo(() => {
    // Multi-word search: every word must appear somewhere in the id or name, in
    // any order (so "deepseek v4" matches "deepseek flash v4"). Tokens with '='
    // are model params (e.g. quality=low), not search terms.
    const terms = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((t) => t && !t.includes('='));
    return pool
      .filter((m) => {
        if (!terms.length) return true;
        const haystack = `${m.id} ${m.name}`.toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .slice(0, 40);
  }, [pool, query]);

  const known = !!value && pool.some((m) => m.id === baseId(value));

  const choose = (mid: string) => {
    onChange(mid);
    setQuery(mid);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="pl-7"
          onChange={(e) => {
            onChange(e.target.value);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery(value);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
        />
      </div>
      {value && pool.length > 0 && (
        <p
          className={cn(
            'mt-1 text-[11px]',
            known ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {known ? '✓ encontrado no catálogo' : '⚠ fora do catálogo (vai assim mesmo)'}
        </p>
      )}
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m.id);
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{m.id}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {(m.inputModalities.join('+') || 'text')} → {(m.outputModalities.join('+') || 'text')}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{priceLabel(m)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ModelCombobox;
