import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface StringListProps {
  items: string[];
  placeholder?: string;
  onChange: (items: string[]) => void;
}

/** Editable list of free-text strings (used for method + restrictions). */
export function StringList({ items, placeholder, onChange }: StringListProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft('');
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const edit = (index: number, value: string) => {
    onChange(items.map((item, i) => (i === index ? value : item)));
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            autoComplete="off"
            onChange={(e) => edit(i, e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? 'Add item…'}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default StringList;
