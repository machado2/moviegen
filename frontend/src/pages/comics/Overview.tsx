import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ComicsProject,
  ComicsProjectDTO,
  JobProgress,
  ParsedComicsScript,
} from '@mediagen/types';
import { Download, FileUp, Save, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [parseOpen, setParseOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedComicsScript | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseJob, setParseJob] = useState<JobProgress | null>(null);
  const [parseLogs, setParseLogs] = useState<Array<{ time: number; message: string }>>([]);
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const scriptInput = useRef<HTMLInputElement>(null);
  const structuredInput = useRef<HTMLInputElement>(null);

  // Follow a parse job over SSE: stream progress, then load the persisted
  // result on success. Shared by a fresh parse and by re-attaching after a
  // reload, so both behave identically.
  const trackParse = useCallback(
    (jobId: string) => {
      comicsApi.assembly.subscribeJob(
        project.id,
        jobId,
        (p) => {
          setParseJob(p);
          // Append every distinct message to the rolling log (cap at 200).
          setParseLogs((prev) => {
            const last = prev[prev.length - 1];
            if (last?.message === p.message) return prev;
            const next = [...prev, { time: Date.now(), message: p.message }];
            return next.length > 200 ? next.slice(-200) : next;
          });
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
    },
    [project.id],
  );

  // On load, restore parse state the page was away for: re-attach to an
  // in-flight parse job, or surface a finished-but-unapplied result. Both are
  // server-side, so a reload mid-parse never loses anything.
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
        if (alive && pending) setParsed(pending);
      } catch {
        /* no pending parse, or project not yet loaded */
      }
    })();
    return () => {
      alive = false;
    };
  }, [project.id, trackParse]);

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
    setParsed(null);
    setParseJob(null);
    setParseLogs([]);
    setParseOpen(true);
    try {
      // Parse runs server-side as a job; the result is persisted, so closing
      // this dialog (or reloading) is safe — trackParse follows it over SSE.
      const { jobId } = await comicsApi.script.parse(project.id);
      trackParse(jobId);
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
          {parsing && (
            <Button variant="secondary" onClick={() => setParseOpen(true)}>
              <Sparkles className="h-4 w-4" /> Ver progresso do parse
            </Button>
          )}
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
        parseLogs={parseLogs}
      />
    </div>
  );
}

export default Overview;
