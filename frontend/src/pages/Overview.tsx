import { useCallback, useEffect, useState } from 'react';
import type { JobProgress, ParsedScript, ProjectDTO } from '@mediagen/types';
import { Download, Save, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StringList } from '@/components/StringList';
import { ScriptUpload } from '@/components/ScriptUpload';
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
      api.assembly.subscribeJob(
        project.id,
        jobId,
        (p) => {
          setParseJob(p);
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
    setParsing(true);
    setParseError(null);
    setParseJob(null);
    try {
      const { jobId } = await api.script.parse(project.id);
      trackParse(jobId);
    } catch (e) {
      setParsing(false);
      setParseError(e instanceof ApiClientError ? e.message : String(e));
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
            <Button onClick={() => void parseScript()} disabled={parsing}>
              <Sparkles className="h-4 w-4" />
              {parsing ? 'Parseando…' : 'Parsear com IA'}
            </Button>
            <Button variant="outline" onClick={() => void api.projects.export(project.id)}>
              <Download className="h-4 w-4" /> Exportar projeto
            </Button>
          </div>

          {parsing && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round((parseJob?.progress ?? 0) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {parseJob?.message ?? 'Parseando o roteiro…'} — aplica e versiona automaticamente ao terminar.
              </p>
            </div>
          )}
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          <p className="text-xs text-muted-foreground">
            O parse aplica a estrutura automaticamente e registra uma versão. Para revisar ou desfazer, use o Histórico.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default Overview;
