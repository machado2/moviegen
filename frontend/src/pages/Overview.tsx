import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobProgress, ParsedScript, ProjectDTO } from '@mediagen/types';
import { Download, Save, Sparkles, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StringList } from '@/components/StringList';
import { ScriptUpload } from '@/components/ScriptUpload';
import { useSettings } from '@/hooks/useSettings';
import { api, ApiClientError } from '@/api/client';

export interface OverviewProps {
  project: ProjectDTO;
  onChanged: () => void;
}

export function Overview({ project, onChanged }: OverviewProps) {
  const [title, setTitle] = useState(project.title);
  const [globalStyle, setGlobalStyle] = useState(project.globalStyle);
  const [method, setMethod] = useState<string[]>(project.method);
  const [restrictions, setRestrictions] = useState<string[]>(project.restrictions);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [parsing, setParsing] = useState(false);
  const [parseJob, setParseJob] = useState<JobProgress | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmParse, setConfirmParse] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [parseLog, setParseLog] = useState<string[]>([]);
  // Live SSE unsubscribe, so we can tear the stream down on unmount/navigate and
  // before re-subscribing — otherwise a parse left running leaks an EventSource.
  const parseSubRef = useRef<(() => void) | null>(null);
  const { settings } = useSettings();
  const needsKey = !!settings && !settings.hasApiKey && !settings.apiKeyFromEnv;

  // Apply a finished parse automatically and commit it (the git history is the
  // review mechanism — no confirmation popup). Then refresh the project.
  const autoApply = useCallback(
    async (p: ParsedScript) => {
      try {
        await api.script.apply(project.id, p);
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof ApiClientError ? e.message : String(e));
      } finally {
        onChanged();
      }
    },
    [project.id, onChanged],
  );

  // Follow a parse job over SSE; on success, fetch the result and apply it.
  const trackParse = useCallback(
    (jobId: string) => {
      parseSubRef.current?.(); // close any previous stream before re-subscribing
      parseSubRef.current = api.assembly.subscribeJob(
        project.id,
        jobId,
        (p) => {
          setParseJob(p);
          // Accumulate each distinct agent step into a live log. Heartbeats
          // (prefixed "⏳") stay on the live status line only, not the log.
          if (p.message && !p.message.startsWith('⏳')) {
            setParseLog((prev) => (prev[prev.length - 1] === p.message ? prev : [...prev, p.message]));
          }
          if (p.status === 'done') {
            setParsing(false);
            void api.script
              .parsed(project.id)
              .then((result) => {
                if (result) void autoApply(result);
              })
              .catch((e) => setParseError(e instanceof ApiClientError ? e.message : String(e)));
          } else if (p.status === 'error') {
            setParsing(false);
            setParseError(p.error ?? 'Falha ao parsear o roteiro');
          }
        },
        () => {
          setParsing(false);
          setParseError('Conexão de progresso perdida. O parse pode ainda estar rodando no servidor.');
        },
      );
    },
    [project.id, autoApply],
  );

  // Re-attach to an in-flight parse after a reload, or apply a finished-but-not-
  // yet-applied result left pending on the server.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const active = await api.script.parseActive(project.id);
        if (!alive) return;
        if (active && (active.status === 'running' || active.status === 'queued')) {
          setParsing(true);
          setParseJob(active);
          trackParse(active.id);
          return;
        }
        const pending = await api.script.parsed(project.id);
        if (alive && pending) void autoApply(pending);
      } catch {
        /* no pending parse */
      }
    })();
    return () => {
      alive = false;
      parseSubRef.current?.();
      parseSubRef.current = null;
    };
  }, [project.id, trackParse, autoApply]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.projects.update(project.id, { title, globalStyle, method, restrictions });
      onChanged();
    } catch (e) {
      setSaveError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadScript = async (file: File) => {
    await api.script.upload(project.id, file);
    onChanged();
  };

  const parseScript = async () => {
    setConfirmParse(false);
    setParsing(true);
    setParseError(null);
    setParseJob(null);
    setParseLog([]);
    try {
      const { jobId } = await api.script.parse(project.id);
      trackParse(jobId);
    } catch (e) {
      setParsing(false);
      setParseError(e instanceof ApiClientError ? e.message : String(e));
    }
  };

  const abortParse = async () => {
    setAborting(true);
    try {
      await api.script.cancelParse(project.id);
    } catch (e) {
      setParseError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setAborting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Projeto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="style">Estilo global</Label>
            <Textarea
              id="style"
              value={globalStyle}
              onChange={(e) => setGlobalStyle(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-1">
            <Label>Princípios de produção</Label>
            <StringList items={method} placeholder="Adicionar um princípio…" onChange={setMethod} />
          </div>
          <div className="space-y-1">
            <Label>Restrições</Label>
            <StringList items={restrictions} placeholder="Adicionar uma regra de 'nunca fazer'…" onChange={setRestrictions} />
          </div>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roteiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <ScriptUpload onUpload={(f) => void uploadScript(f)}>
              <Button variant="outline">
                <Upload className="h-4 w-4" /> Carregar roteiro
              </Button>
            </ScriptUpload>
            <Button onClick={() => setConfirmParse(true)} disabled={parsing || needsKey}>
              <Sparkles className="h-4 w-4" />
              {parsing ? 'Parseando…' : 'Parsear com IA'}
            </Button>
            <Button
              variant="outline"
              onClick={() => void api.projects.export(project.id, { media: 'structure' })}
              title="Só os arquivos .ncl + roteiro (sem mídia) — leve, ideal para editar/transportar"
            >
              <Download className="h-4 w-4" /> Exportar estrutura (.ncl)
            </Button>
            <Button
              variant="outline"
              onClick={() => void api.projects.export(project.id, { media: 'full' })}
              title="Projeto completo, incluindo toda a mídia gerada"
            >
              <Download className="h-4 w-4" /> Exportar com mídia
            </Button>
          </div>
          {needsKey && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Configure a chave do gateway LLM em Configurações para parsear.
            </p>
          )}

          {parsing && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round((parseJob?.progress ?? 0) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {parseJob?.message ?? 'Parseando o roteiro…'} — aplica e versiona automaticamente ao terminar.
                </p>
                <Button variant="destructive" size="sm" onClick={() => void abortParse()} disabled={aborting} className="gap-1 shrink-0">
                  <X className="h-3.5 w-3.5" /> {aborting ? 'Abortando…' : 'Abortar'}
                </Button>
              </div>
              {parseLog.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {parseLog.slice(-40).map((line, i) => (
                    <li key={`${i}-${line}`}>· {line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          <p className="text-xs text-muted-foreground">
            O parse aplica a estrutura automaticamente e registra uma versão. Para revisar ou desfazer, use o Histórico.
          </p>
        </CardContent>
      </Card>

      <Dialog open={confirmParse} onOpenChange={setConfirmParse}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parsear roteiro com IA?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Isso roda um agente de IA que monta a estrutura em vários passos (personagens,
              cenas, shots) e pode custar, conforme o modelo. Você acompanha os passos ao vivo
              e pode abortar enquanto roda.
            </p>
            <p className="text-muted-foreground">
              Reparsear mescla pelo número da cena: preserva as tomadas geradas e edições
              manuais, atualizando só os textos. Uma versão é registrada no Histórico.
            </p>
            <p className="text-muted-foreground">
              Modelo de parse: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{settings?.parseModel ?? '—'}</code>
              {' '}· muda em Configurações.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmParse(false)}>Cancelar</Button>
            <Button onClick={() => void parseScript()}>
              <Sparkles className="h-4 w-4" /> Parsear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Overview;
