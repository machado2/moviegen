import { useRef, useState } from 'react';
import type { Quadro, QuadroText, QuadroTextType } from '@mediagen/types';
import {
  Check,
  FileText,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StringList } from '@/components/StringList';
import { comicsApi } from '@/api/comicsClient';
import { cn } from '@/lib/utils';

const TEXT_TYPE_LABEL: Record<QuadroTextType, string> = {
  dialogue: 'Balão',
  offscreen: 'Off-panel',
  'voice-over': 'V.O.',
  caption: 'Legenda',
  sfx: 'SFX',
  sign: 'Placa',
  title: 'Título',
};

export interface QuadroCardProps {
  projectId: string;
  pranchaId: string;
  quadro: Quadro;
  onViewRender: (quadro: Quadro, renderId: string) => void;
  onViewPrompt: (quadro: Quadro) => void;
  onSelectRender: (quadroId: string, renderId: string | null) => void;
  onGenerate: (quadroId: string) => Promise<void>;
  onUpdate: (quadroId: string, patch: Partial<Quadro>) => Promise<void>;
  onDelete: (quadroId: string) => void;
  onChanged: () => void;
  /** Open the full generation workbench (modal) for this quadro, if available. */
  onOpenStudio?: () => void;
}

export function QuadroCard({
  projectId,
  pranchaId,
  quadro,
  onViewRender,
  onViewPrompt,
  onSelectRender,
  onGenerate,
  onUpdate,
  onDelete,
  onChanged,
  onOpenStudio,
}: QuadroCardProps) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      await onGenerate(quadro.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number }).status;
      if (status === 503) {
        setGenError(
          'A geração via codex não está disponível neste servidor. Faça upload de um render manualmente.',
        );
      } else {
        setGenError(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await comicsApi.renders.upload(projectId, pranchaId, quadro.id, file);
      onChanged();
    } finally {
      setUploading(false);
    }
  };

  const sortedRenders = [...quadro.renders].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span>Q{quadro.order}</span>
          <span className="text-muted-foreground">·</span>
          <Badge variant="outline">{quadro.slotFormat}</Badge>
          {quadro.characters.length > 0 && (
            <span className="font-normal text-muted-foreground">
              personagens: {quadro.characters.join(', ')}
            </span>
          )}
        </div>

        <div className="space-y-1 text-xs">
          {quadro.composition && (
            <p>
              <span className="font-medium">Composição:</span>{' '}
              {quadro.composition}
            </p>
          )}
          {quadro.texts.length > 0 && (
            <div>
              <span className="font-medium">Textos:</span>
              <ul className="ml-1">
                {quadro.texts.map((t, i) => (
                  <li key={i} className="text-muted-foreground">
                    [{TEXT_TYPE_LABEL[t.type]}
                    {t.speaker ? ` ${t.speaker}` : ''}] &ldquo;{t.text}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quadro.setting && (
            <p>
              <span className="font-medium">Cenário:</span> {quadro.setting}
            </p>
          )}
          {quadro.restrictions.length > 0 && (
            <p>
              <span className="font-medium">Restrições:</span>{' '}
              {quadro.restrictions.join('; ')}
            </p>
          )}
          {quadro.refs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-medium">Refs:</span>
              {quadro.refs.map((r) => (
                <Badge key={r} variant="secondary">
                  {r}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-medium">
            Renders ({sortedRenders.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {sortedRenders.map((r) => {
              const selected = quadro.selectedRenderId === r.id;
              const url = comicsApi.renders.imageUrl(
                projectId,
                pranchaId,
                quadro.id,
                r.id,
              );
              return (
                <div
                  key={r.id}
                  className={cn(
                    'w-20 space-y-1 rounded-md border p-1',
                    selected ? 'border-green-600 bg-green-50' : 'border-border',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onViewRender(quadro, r.id)}
                    className="block h-16 w-full overflow-hidden rounded bg-muted"
                    title="Ver maior"
                  >
                    <img
                      src={url}
                      alt={r.id}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <div className="flex items-center justify-between gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      title={selected ? 'Selecionado' : 'Selecionar'}
                      onClick={() =>
                        onSelectRender(quadro.id, selected ? null : r.id)
                      }
                    >
                      {selected ? (
                        <Check className="h-3 w-3 text-green-700" />
                      ) : (
                        <Star className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      title="Deletar render"
                      onClick={async () => {
                        await comicsApi.renders.remove(
                          projectId,
                          pranchaId,
                          quadro.id,
                          r.id,
                        );
                        onChanged();
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-16 w-20 flex-col"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Enviando…' : 'Upload'}
            </Button>
          </div>
        </div>

        {genError && <p className="text-xs text-destructive">{genError}</p>}

        <div className="flex flex-wrap gap-2 border-t pt-2">
          {onOpenStudio ? (
            <Button size="sm" onClick={onOpenStudio}>
              <Wand2 className="h-3 w-3" /> Gerar no Estúdio
            </Button>
          ) : (
            <Button size="sm" disabled={generating} onClick={() => void generate()}>
              <Sparkles className="h-3 w-3" />
              {generating ? 'Gerando…' : 'Gerar Render'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewPrompt(quadro)}
          >
            <FileText className="h-3 w-3" /> Ver Prompt
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3 w-3" /> Editar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDelete(quadro.id)}
          >
            <Trash2 className="h-3 w-3" /> Deletar
          </Button>
        </div>
      </CardContent>

      <QuadroEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        quadro={quadro}
        onSave={async (patch) => {
          await onUpdate(quadro.id, patch);
          setEditOpen(false);
        }}
      />
    </Card>
  );
}

const TEXT_TYPES: QuadroTextType[] = [
  'dialogue',
  'offscreen',
  'voice-over',
  'caption',
  'sfx',
  'sign',
  'title',
];

interface QuadroEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quadro: Quadro;
  onSave: (patch: Partial<Quadro>) => Promise<void>;
}

function QuadroEditDialog({
  open,
  onOpenChange,
  quadro,
  onSave,
}: QuadroEditDialogProps) {
  const [composition, setComposition] = useState(quadro.composition);
  const [setting, setSetting] = useState(quadro.setting);
  const [characters, setCharacters] = useState<string[]>(quadro.characters);
  const [refs, setRefs] = useState<string[]>(quadro.refs);
  const [restrictions, setRestrictions] = useState<string[]>(
    quadro.restrictions,
  );
  const [texts, setTexts] = useState<QuadroText[]>(quadro.texts);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setComposition(quadro.composition);
    setSetting(quadro.setting);
    setCharacters(quadro.characters);
    setRefs(quadro.refs);
    setRestrictions(quadro.restrictions);
    setTexts(quadro.texts);
  };

  const updateText = (index: number, patch: Partial<QuadroText>) => {
    setTexts((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ composition, setting, characters, refs, restrictions, texts });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar quadro Q{quadro.order}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label htmlFor="q-comp">Composição</Label>
            <Textarea
              id="q-comp"
              value={composition}
              onChange={(e) => setComposition(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="q-setting">Cenário</Label>
            <Textarea
              id="q-setting"
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Personagens (ids de asset)</Label>
            <StringList
              items={characters}
              placeholder="id de personagem…"
              onChange={setCharacters}
            />
          </div>
          <div className="space-y-1">
            <Label>Refs (ids de asset)</Label>
            <StringList
              items={refs}
              placeholder="id de asset…"
              onChange={setRefs}
            />
          </div>
          <div className="space-y-1">
            <Label>Restrições</Label>
            <StringList
              items={restrictions}
              placeholder="restrição específica…"
              onChange={setRestrictions}
            />
          </div>
          <div className="space-y-2">
            <Label>Textos</Label>
            {texts.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={t.type}
                  onChange={(e) =>
                    updateText(i, { type: e.target.value as QuadroTextType })
                  }
                >
                  {TEXT_TYPES.map((tt) => (
                    <option key={tt} value={tt}>
                      {TEXT_TYPE_LABEL[tt]}
                    </option>
                  ))}
                </select>
                <Input
                  className="w-28"
                  placeholder="speaker"
                  value={t.speaker ?? ''}
                  onChange={(e) =>
                    updateText(i, { speaker: e.target.value || undefined })
                  }
                />
                <Input
                  className="min-w-40 flex-1"
                  placeholder="texto"
                  value={t.text}
                  onChange={(e) => updateText(i, { text: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setTexts((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setTexts((prev) => [...prev, { type: 'dialogue', text: '' }])
              }
            >
              Adicionar texto
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QuadroCard;
