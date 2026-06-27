import { useEffect, useState } from 'react';
import type { ModelCatalogEntry } from '@mediagen/types';
import { KeyRound, Plus, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ModelCombobox, type ModelPurposeExt } from '@/components/ModelCombobox';
import { useSettings } from '@/hooks/useSettings';
import { api, ApiClientError } from '@/api/client';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Video models aren't in the OpenRouter catalog; suggest the known gateway-routed
// ids (verified available on the Gemini key — newest first, "fast" = cheaper).
const VIDEO_SUGGESTIONS = [
  'gemini/veo-3.1-generate-preview',
  'gemini/veo-3.1-fast-generate-preview',
  'gemini/veo-3.0-generate-001',
  'gemini/veo-3.0-fast-generate-001',
  'gemini/veo-2.0-generate-001',
];

/**
 * A curated model shortlist: removable chips (first = default) plus a searchable
 * combobox to add ids. Saves on every change. Keeps the giant catalog out of the
 * per-use selectors elsewhere — those only show the shortlist.
 */
function ModelShortlist({
  label,
  hint,
  models,
  purpose,
  catalog,
  knownIds,
  placeholder,
  onSave,
}: {
  label: string;
  hint: string;
  models: string[];
  purpose: ModelPurposeExt;
  catalog: ModelCatalogEntry[];
  knownIds?: string[];
  placeholder?: string;
  onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const m = draft.trim();
    setDraft('');
    if (!m || models.includes(m)) return;
    onSave([...models, m]);
  };
  const remove = (m: string) => onSave(models.filter((x) => x !== m));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {models.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {models.map((m, i) => (
            <li key={m}>
              <span className="inline-flex items-center gap-1 rounded border bg-muted/40 py-0.5 pl-2 pr-1 text-xs font-mono">
                {i === 0 && <span className="font-sans text-[10px] text-primary" title="padrão">padrão</span>}
                {m}
                <button type="button" onClick={() => remove(m)} className="rounded p-0.5 hover:bg-muted" title="Remover">
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <ModelCombobox
            value={draft}
            onChange={setDraft}
            purpose={purpose}
            catalog={catalog}
            knownIds={knownIds}
            placeholder={placeholder}
          />
        </div>
        <Button variant="outline" onClick={add} disabled={!draft.trim()} className="shrink-0">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { settings, update } = useSettings();
  const [apiKey, setApiKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [parseModel, setParseModel] = useState('');
  const [ttsModel, setTtsModel] = useState('');
  const [spendCap, setSpendCap] = useState('');
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [videoModels, setVideoModels] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setParseModel(settings.parseModel);
      setTtsModel(settings.ttsModel);
      setSpendCap(settings.spendCapUsd != null ? String(settings.spendCapUsd) : '');
      setLlmModels(settings.llmModels);
      setImageModels(settings.imageModels);
      setVideoModels(settings.videoModels);
    }
  }, [settings]);

  // Load the searchable model catalog when the panel opens (best-effort: the
  // fields stay usable as free text if the upstream catalog can't be reached).
  useEffect(() => {
    if (!open || catalog.length > 0) return;
    void api.models.catalog().then(setCatalog).catch(() => setCatalog([]));
  }, [open, catalog.length]);

  const saveKey = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({ llmApiKey: apiKey.trim() || null });
      setApiKey('');
      setEditingKey(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({ llmApiKey: null });
      setEditingKey(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // The parse-model picker autosaves on change (like the shortlists), so a fresh
  // selection is persisted before the user clicks "Parsear". The parse reads the
  // model server-side, so an unsaved selection would otherwise run with the
  // previously-saved model.
  const saveParseModel = async (value: string) => {
    setParseModel(value);
    setError(null);
    try {
      await update({ parseModel: value.trim() || null });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    }
  };

  const saveTts = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({ ttsModel: ttsModel.trim() || null });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveList = async (key: 'llmModels' | 'imageModels' | 'videoModels', next: string[]) => {
    if (key === 'llmModels') setLlmModels(next);
    else if (key === 'imageModels') setImageModels(next);
    else setVideoModels(next);
    setError(null);
    try {
      await update({ [key]: next });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    }
  };

  const saveCap = async () => {
    setSaving(true);
    setError(null);
    try {
      const trimmed = spendCap.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
        throw new Error('Informe um valor em dólares (ex.: 5) ou deixe vazio para sem teto.');
      }
      await update({ spendCapUsd: parsed });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // The parse selector offers the LLM shortlist; keep the current value visible
  // even if it isn't in the list (e.g. a default that predates the shortlist).
  const parseOptions = Array.from(new Set([...(parseModel ? [parseModel] : []), ...llmModels]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações globais</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Chave do gateway LLM</Label>
              {settings && (
                <Badge variant={settings.hasApiKey ? 'success' : 'warning'}>
                  {settings.hasApiKey ? 'configurada' : 'não definida'}
                </Badge>
              )}
            </div>

            {settings?.apiKeyFromEnv ? (
              <p className="text-sm text-muted-foreground">
                Fornecida pelo ambiente (<code className="font-mono">LLM_API_KEY</code>) — não editável aqui.
              </p>
            ) : editingKey ? (
              <div className="flex gap-2">
                <Input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  placeholder={settings?.hasApiKey ? 'cole uma nova chave' : 'sk-…'}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <Button variant="ghost" onClick={() => { setEditingKey(false); setApiKey(''); }}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {settings?.hasApiKey && (
                  <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
                    {settings.apiKeyHint ?? '••••'}
                  </code>
                )}
                <Button variant="outline" onClick={() => setEditingKey(true)}>
                  <KeyRound className="h-4 w-4" />
                  {settings?.hasApiKey ? 'Trocar chave' : 'Definir chave'}
                </Button>
                {settings?.hasApiKey && (
                  <Button variant="ghost" onClick={() => void clearKey()} disabled={saving}>
                    Remover
                  </Button>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Chave única do gateway LiteLLM (rota os modelos para os provedores reais). Usada por
              todos os projetos, armazenada no servidor e nunca retornada ao navegador.
            </p>

            {!settings?.apiKeyFromEnv && editingKey && (
              <Button onClick={() => void saveKey()} disabled={saving || !apiKey.trim()}>
                <Save className="h-4 w-4" /> Salvar chave
              </Button>
            )}
          </div>

          {/* LLM shortlist + the parse/co-creation selector that draws from it. */}
          <ModelShortlist
            label="Modelos de LLM (texto)"
            hint="Lista curada de modelos de texto para parse e co-criação. O primeiro é o padrão. Salva automaticamente."
            models={llmModels}
            purpose="text"
            catalog={catalog}
            placeholder="busque um modelo de texto (ex.: google/gemini-2.5-pro)"
            onSave={(next) => void saveList('llmModels', next)}
          />

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="parseModel">Modelo de parse / co-criação</Label>
              {parseOptions.length > 0 ? (
                <select
                  id="parseModel"
                  value={parseModel}
                  onChange={(e) => void saveParseModel(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 font-mono text-sm"
                >
                  {parseOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">Adicione modelos de LLM acima para escolher.</p>
              )}
              <p className="text-[11px] text-muted-foreground">Salva automaticamente.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ttsModel">Modelo de voz (TTS)</Label>
              <ModelCombobox
                id="ttsModel"
                value={ttsModel}
                onChange={setTtsModel}
                purpose="audio"
                catalog={catalog}
                placeholder="busque ou cole um id (ex.: openai/gpt-4o-mini-tts)"
              />
            </div>
            <Button onClick={() => void saveTts()} disabled={saving}>
              <Save className="h-4 w-4" /> Salvar modelo de voz
            </Button>
          </div>

          <ModelShortlist
            label="Modelos de imagem (gateway)"
            hint="Modelos de geração de imagem roteados pelo gateway. O Estúdio deixa escolher qual usar por geração; o primeiro é o padrão. Pode adicionar params após o id (ex.: quality=low)."
            models={imageModels}
            purpose="image"
            catalog={catalog}
            placeholder="busque um modelo de imagem (ou cole id + params)"
            onSave={(next) => void saveList('imageModels', next)}
          />

          <ModelShortlist
            label="Modelos de vídeo (gateway)"
            hint="Modelos de geração de vídeo (ex.: Veo via Gemini). Não aparecem no catálogo do OpenRouter — use as sugestões ou cole o id. O Estúdio deixa escolher qual usar por geração; o primeiro é o padrão."
            models={videoModels}
            purpose="video"
            catalog={catalog}
            knownIds={VIDEO_SUGGESTIONS}
            placeholder="ex.: gemini/veo-3.0-generate-preview"
            onSave={(next) => void saveList('videoModels', next)}
          />

          <div className="space-y-2">
            <Label htmlFor="spendCap">Teto de gasto por projeto (US$)</Label>
            <div className="flex gap-2">
              <Input
                id="spendCap"
                type="number"
                min={0}
                step="0.5"
                value={spendCap}
                placeholder="sem teto"
                onChange={(e) => setSpendCap(e.target.value)}
                className="max-w-[160px]"
              />
              <Button onClick={() => void saveCap()} disabled={saving}>
                <Save className="h-4 w-4" /> Salvar teto
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Quando o custo de IA de um projeto atinge este valor, a geração no modo API é pausada
              automaticamente. Deixe vazio para não ter teto. Vale o custo informado pelo gateway.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
