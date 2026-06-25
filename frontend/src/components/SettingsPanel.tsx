import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
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
import { useSettings } from '@/hooks/useSettings';
import { ApiClientError } from '@/api/client';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setParseModel(settings.parseModel);
      setTtsModel(settings.ttsModel);
      setSpendCap(settings.spendCapUsd != null ? String(settings.spendCapUsd) : '');
    }
  }, [settings]);

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
              <Input
                id="parseModel"
                value={parseModel}
                placeholder="google/gemini-2.5-pro"
                onChange={(e) => setParseModel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ttsModel">Modelo de voz (TTS)</Label>
              <Input
                id="ttsModel"
                value={ttsModel}
                placeholder="openai/gpt-4o-mini-tts"
                onChange={(e) => setTtsModel(e.target.value)}
              />
            </div>
            <Button onClick={() => void saveModels()} disabled={saving}>
              <Save className="h-4 w-4" /> Salvar modelos
            </Button>
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
