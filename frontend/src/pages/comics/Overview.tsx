import { useEffect, useRef, useState } from 'react';
import type {
  ComicsProject,
  ComicsProjectDTO,
  JobProgress,
  ParsedComicsScript,
} from '@moviegen/types';
import { Download, FileUp, Save, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StringList } from '@/components/StringList';
import { ScriptImportModal } from '@/components/comics/ScriptImportModal';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface OverviewProps {
  project: ComicsProjectDTO;
  onChanged: () => void;
}

export function Overview({ project, onChanged }: OverviewProps) {
  const [title, setTitle] = useState(project.title);
  const [language, setLanguage] = useState(project.language);
  const [globalStyle, setGlobalStyle] = useState(project.globalStyle);
  const [restrictions, setRestrictions] = useState<string[]>(
    project.restrictions,
  );
  const [apiKey, setApiKey] = useState('');
  const [parseModel, setParseModel] = useState(project.parseModel ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [parseOpen, setParseOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedComicsScript | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseJob, setParseJob] = useState<JobProgress | null>(null);
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const scriptInput = useRef<HTMLInputElement>(null);
  const structuredInput = useRef<HTMLInputElement>(null);

  // Restore a parse that finished (or is pending) while the page was away: the
  // result is persisted server-side, so a reload mid-parse never loses it.
  useEffect(() => {
    let alive = true;
    void comicsApi.script
      .parsed(project.id)
      .then((p) => {
        if (alive && p) setParsed(p);
      })
      .catch(() => {
        /* no pending parse, or project not yet loaded */
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Partial<ComicsProject> = {
        title,
        language,
        globalStyle,
        restrictions,
        parseModel: parseModel || undefined,
      };
      if (apiKey.trim()) {
        patch.openrouterApiKey = apiKey.trim();
      }
      await comicsApi.projects.update(project.id, patch);
      setApiKey('');
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
    setParsed(null);
    setParseJob(null);
    setParseOpen(true);
    try {
      const { jobId } = await comicsApi.script.parse(project.id);
      // Parse runs server-side as a job; follow its progress over SSE. The
      // result is persisted, so closing this dialog (or reloading) is safe.
      comicsApi.assembly.subscribeJob(
        project.id,
        jobId,
        (p) => {
          setParseJob(p);
          if (p.status === 'done') {
            setParsing(false);
            void comicsApi.script
              .parsed(project.id)
              .then((result) => setParsed(result))
              .catch((e) =>
                setParseError(e instanceof ComicsApiError ? e.message : String(e)),
              );
          } else if (p.status === 'error') {
            setParsing(false);
            setParseError(p.error ?? 'Falha ao parsear o roteiro');
          }
        },
        () => {
          setParsing(false);
          setParseError(
            'Conexão de progresso perdida. O parse pode continuar rodando no servidor — reabra para conferir.',
          );
        },
      );
    } catch (e) {
      setParsing(false);
      setParseError(e instanceof ComicsApiError ? e.message : String(e));
    }
  };

  const applyParsed = async (p: ParsedComicsScript) => {
    setApplying(true);
    setParseError(null);
    try {
      await comicsApi.script.apply(project.id, p);
      setParseOpen(false);
      setParsed(null);
      onChanged();
    } catch (e) {
      setParseError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const structuredImport = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as ComicsProject;
    await comicsApi.script.structuredImport(project.id, data);
    onChanged();
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
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="language">Idioma</Label>
              <Input
                id="language"
                value={language}
                placeholder="pt-BR"
                onChange={(e) => setLanguage(e.target.value)}
              />
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
            <StringList
              items={restrictions}
              placeholder="Adicionar regra nunca-fazer…"
              onChange={setRestrictions}
            />
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
        <CardContent className="flex flex-wrap gap-2">
          <input
            ref={scriptInput}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadScript(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            onClick={() => scriptInput.current?.click()}
          >
            <Upload className="h-4 w-4" /> Carregar roteiro markdown
          </Button>
          <Button onClick={() => void parseScript()} disabled={parsing}>
            <Sparkles className="h-4 w-4" />
            {parsing ? 'Parseando…' : 'Parsear com IA'}
          </Button>
          {!parsing && parsed && (
            <Button variant="secondary" onClick={() => setParseOpen(true)}>
              <Sparkles className="h-4 w-4" /> Revisar parse pendente
            </Button>
          )}

          <input
            ref={structuredInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void structuredImport(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            onClick={() => structuredInput.current?.click()}
          >
            <FileUp className="h-4 w-4" /> Importar JSON estruturado
          </Button>
          <Button
            variant="outline"
            onClick={() => comicsApi.projects.export(project.id)}
          >
            <Download className="h-4 w-4" /> Exportar ZIP do projeto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Chave de API
            <Badge variant={project.hasApiKey ? 'success' : 'warning'}>
              {project.hasApiKey ? 'configurada' : 'não definida'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="apiKey">Chave OpenRouter</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              placeholder={
                project.hasApiKey
                  ? '•••••••• (deixe em branco para manter)'
                  : 'sk-or-…'
              }
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Armazenada no servidor, nunca retornada ao navegador.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="parseModel">Modelo de parse</Label>
            <Input
              id="parseModel"
              value={parseModel}
              placeholder="google/gemini-2.5-pro"
              onChange={(e) => setParseModel(e.target.value)}
            />
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" /> Salvar configurações de API
          </Button>
        </CardContent>
      </Card>

      <ScriptImportModal
        open={parseOpen}
        onOpenChange={setParseOpen}
        parsed={parsing ? null : parsed}
        applying={applying}
        error={parseError}
        onApply={(p) => void applyParsed(p)}
        parsing={parsing}
        progress={parseJob?.progress ?? 0}
        progressMessage={parseJob?.message}
      />
    </div>
  );
}

export default Overview;
