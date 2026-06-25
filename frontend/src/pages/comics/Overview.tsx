import { useCallback, useEffect, useState } from 'react';
import type { ComicsProjectDTO, JobProgress, ParsedComicsScript } from '@mediagen/types';
import { Download, Save, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StringList } from '@/components/StringList';
import { ScriptUpload } from '@/components/ScriptUpload';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface OverviewProps {
  project: ComicsProjectDTO;
  onChanged: () => void;
}

export function Overview({ project, onChanged }: OverviewProps) {
  const [title, setTitle] = useState(project.title);
  const [language, setLanguage] = useState(project.language);
  const [globalStyle, setGlobalStyle] = useState(project.globalStyle);
  const [restrictions, setRestrictions] = useState<string[]>(project.restrictions);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [parsing, setParsing] = useState(false);
  const [parseJob, setParseJob] = useState<JobProgress | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Apply a finished parse automatically and commit it (git history is the
  // review mechanism — no confirmation popup), then refresh the project.
  const autoApply = useCallback(
    async (p: ParsedComicsScript) => {
      try {
        await comicsApi.script.apply(project.id, p);
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof ComicsApiError ? e.message : String(e));
      } finally {
        onChanged();
      }
    },
    [project.id, onChanged],
  );

  const trackParse = useCallback(
    (jobId: string) => {
      comicsApi.assembly.subscribeJob(
        project.id,
        jobId,
        (p) => {
          setParseJob(p);
          if (p.status === 'done') {
            setParsing(false);
            void comicsApi.script
              .parsed(project.id)
              .then((result) => {
                if (result) void autoApply(result);
              })
              .catch((e) => setParseError(e instanceof ComicsApiError ? e.message : String(e)));
          } else if (p.status === 'error') {
            setParsing(false);
            setParseError(p.error ?? 'Falha ao parsear o roteiro');
          }
        },
        () => {
          setParsing(false);
          setParseError('Conexão de progresso perdida. O parse pode continuar rodando no servidor.');
        },
      );
    },
    [project.id, autoApply],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const active = await comicsApi.script.parseActive(project.id);
        if (!alive) return;
        if (active && (active.status === 'running' || active.status === 'queued')) {
          setParsing(true);
          setParseJob(active);
          trackParse(active.id);
          return;
        }
        const pending = await comicsApi.script.parsed(project.id);
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
      await comicsApi.projects.update(project.id, { title, language, globalStyle, restrictions });
      onChanged();
    } catch (e) {
      setSaveError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadScript = async (file: File) => {
    await comicsApi.script.uploadFile(project.id, file);
    onChanged();
  };

  const parseScript = async () => {
    setParsing(true);
    setParseError(null);
    setParseJob(null);
    try {
      const { jobId } = await comicsApi.script.parse(project.id);
      trackParse(jobId);
    } catch (e) {
      setParsing(false);
      setParseError(e instanceof ComicsApiError ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Projeto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="language">Idioma</Label>
              <Input id="language" value={language} placeholder="pt-BR" onChange={(e) => setLanguage(e.target.value)} />
            </div>
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
            <Label>Restrições globais</Label>
            <StringList items={restrictions} placeholder="Adicionar regra nunca-fazer…" onChange={setRestrictions} />
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
            <Button variant="outline" onClick={() => comicsApi.projects.export(project.id)}>
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
