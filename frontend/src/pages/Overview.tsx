import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobProgress, ParsedScript, Project, ProjectDTO } from '@mediagen/types';
import { Download, FileUp, Save, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StringList } from '@/components/StringList';
import { ScriptImportModal } from '@/components/ScriptImportModal';
import { api, ApiClientError } from '@/api/client';

export interface OverviewProps {
  project: ProjectDTO;
  onChanged: () => void;
}

export function Overview({ project, onChanged }: OverviewProps) {
  const [title, setTitle] = useState(project.title);
  const [globalStyle, setGlobalStyle] = useState(project.globalStyle);
  const [method, setMethod] = useState<string[]>(project.method);
  const [restrictions, setRestrictions] = useState<string[]>(
    project.restrictions,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [parseOpen, setParseOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedScript | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseJob, setParseJob] = useState<JobProgress | null>(null);
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const scriptInput = useRef<HTMLInputElement>(null);
  const structuredInput = useRef<HTMLInputElement>(null);

  // Follow a parse job over SSE: stream progress, then load the persisted
  // result on success. Shared by a fresh parse and by re-attaching after a
  // reload, so both behave identically.
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
              .then((result) => setParsed(result))
              .catch((e) =>
                setParseError(e instanceof ApiClientError ? e.message : String(e)),
              );
          } else if (p.status === 'error') {
            setParsing(false);
            setParseError(p.error ?? 'Failed to parse the screenplay');
          }
        },
        () => {
          setParsing(false);
          setParseError(
            'Lost the progress connection. The parse may still be running on the server — reopen to check.',
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
        const active = await api.script.parseActive(project.id);
        if (!alive) return;
        if (active && (active.status === 'running' || active.status === 'queued')) {
          setParsing(true);
          setParseJob(active);
          trackParse(active.id);
          return;
        }
        const pending = await api.script.parsed(project.id);
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
    setParsed(null);
    setParseJob(null);
    setParseOpen(true);
    try {
      // Parse runs server-side as a job; the result is persisted, so closing
      // this dialog (or reloading) is safe — trackParse follows it over SSE.
      const { jobId } = await api.script.parse(project.id);
      trackParse(jobId);
    } catch (e) {
      setParsing(false);
      setParseError(e instanceof ApiClientError ? e.message : String(e));
    }
  };

  const applyParsed = async (p: ParsedScript) => {
    setApplying(true);
    setParseError(null);
    try {
      await api.script.apply(project.id, p);
      setParseOpen(false);
      setParsed(null);
      onChanged();
    } catch (e) {
      setParseError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const structuredImport = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as Project;
    await api.script.structuredImport(project.id, data);
    onChanged();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="style">Global style</Label>
            <Textarea
              id="style"
              value={globalStyle}
              onChange={(e) => setGlobalStyle(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-1">
            <Label>Method principles</Label>
            <StringList
              items={method}
              placeholder="Add a production principle…"
              onChange={setMethod}
            />
          </div>
          <div className="space-y-1">
            <Label>Restrictions</Label>
            <StringList
              items={restrictions}
              placeholder="Add a never-do rule…"
              onChange={setRestrictions}
            />
          </div>
          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Script</CardTitle>
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
            <Upload className="h-4 w-4" /> Upload markdown script
          </Button>
          <Button onClick={() => void parseScript()} disabled={parsing}>
            <Sparkles className="h-4 w-4" />
            {parsing ? 'Parsing…' : 'Parse with AI'}
          </Button>
          {parsing && (
            <Button variant="secondary" onClick={() => setParseOpen(true)}>
              <Sparkles className="h-4 w-4" /> View parse progress
            </Button>
          )}
          {!parsing && parsed && (
            <Button variant="secondary" onClick={() => setParseOpen(true)}>
              <Sparkles className="h-4 w-4" /> Review pending parse
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
            <FileUp className="h-4 w-4" /> Import structured JSON
          </Button>
          <Button
            variant="outline"
            onClick={() => void api.projects.export(project.id)}
          >
            <Download className="h-4 w-4" /> Export project ZIP
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
