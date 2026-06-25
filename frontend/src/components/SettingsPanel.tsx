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
import { ModelCombobox } from '@/components/ModelCombobox';
import { useSettings } from '@/hooks/useSettings';
import { api, ApiClientError } from '@/api/client';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { settings, update } = useSettings();
  const [apiKey, setApiKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [parseModel, setParseModel] = useState('');
  const [ttsModel, setTtsModel] = useState('');
  const [spendCap, setSpendCap] = useState('');
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [imgDraft, setImgDraft] = useState('');
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setParseModel(settings.parseModel);
      setTtsModel(settings.ttsModel);
      setSpendCap(settings.spendCapUsd != null ? String(settings.spendCapUsd) : '');
      setImageModels(settings.imageModels);
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

  const saveModels = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({
        parseModel: parseModel.trim() || null,
        ttsModel: ttsModel.trim() || null,
      });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveImageModels = async (next: string[]) => {
    setImageModels(next);
    setError(null);
    try {
      await update({ imageModels: next });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    }
  };

  const addImageModel = () => {
    const m = imgDraft.trim();
    setImgDraft('');
    if (!m || imageModels.includes(m)) return;
    void saveImageModels([...imageModels, m]);
  };
  const removeImageModel = (m: string) => void saveImageModels(imageModels.filter((x) => x !== m));

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="parseModel">Modelo de parse</Label>
              <ModelCombobox
                id="parseModel"
                value={parseModel}
                onChange={setParseModel}
                purpose="text"
                catalog={catalog}
                placeholder="busque ou cole um id (ex.: google/gemini-2.5-pro)"
              />
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
            <Button onClick={() => void saveModels()} disabled={saving}>
              <Save className="h-4 w-4" /> Salvar modelos
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Modelos de imagem (gateway)</Label>
            {imageModels.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {imageModels.map((m, i) => (
                  <li key={m}>
                    <span className="inline-flex items-center gap-1 rounded border bg-muted/40 py-0.5 pl-2 pr-1 text-xs font-mono">
                      {i === 0 && <span className="font-sans text-[10px] text-primary" title="padrão no Estúdio">padrão</span>}
                      {m}
                      <button
                        type="button"
                        onClick={() => removeImageModel(m)}
                        className="rounded p-0.5 hover:bg-muted"
                        title="Remover"
                      >
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
                  value={imgDraft}
                  onChange={setImgDraft}
                  purpose="image"
                  catalog={catalog}
                  placeholder="busque um modelo de imagem (ou cole id + params, ex.: …image-2 quality=low)"
                />
              </div>
              <Button variant="outline" onClick={addImageModel} disabled={!imgDraft.trim()} className="shrink-0">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Modelos de geração de imagem roteados pelo gateway. O Estúdio deixa escolher qual usar
              por geração; o primeiro da lista é o padrão. Salva automaticamente. Pode adicionar
              params depois do id (ex.: <code className="font-mono">quality=low</code>).
            </p>
          </div>

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
