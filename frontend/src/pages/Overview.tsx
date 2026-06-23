import { useRef, useState } from 'react';
import type { ParsedScript, Project, ProjectDTO } from '@mediagen/types';
import { Download, FileUp, Save, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  const [apiKey, setApiKey] = useState('');
  const [parseModel, setParseModel] = useState(project.parseModel ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [parseOpen, setParseOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedScript | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const scriptInput = useRef<HTMLInputElement>(null);
  const structuredInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const patch: Partial<Project> = {
        title,
        globalStyle,
        method,
        restrictions,
        parseModel: parseModel || undefined,
      };
      if (apiKey.trim()) {
        patch.openrouterApiKey = apiKey.trim();
      }
      await api.projects.update(project.id, patch);
      setApiKey('');
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
    setParseOpen(true);
    try {
      const result = await api.script.parse(project.id);
      setParsed(result);
    } catch (e) {
      setParseError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setParsing(false);
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            API key
            <Badge variant={project.hasApiKey ? 'success' : 'warning'}>
              {project.hasApiKey ? 'configured' : 'not set'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="apiKey">OpenRouter API key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              placeholder={
                project.hasApiKey ? '•••••••• (leave blank to keep)' : 'sk-or-…'
              }
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Stored on the server, never returned to the browser.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="parseModel">Parse model</Label>
            <Input
              id="parseModel"
              value={parseModel}
              placeholder="google/gemini-2.5-pro"
              onChange={(e) => setParseModel(e.target.value)}
            />
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" /> Save API settings
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
      />
    </div>
  );
}

export default Overview;
