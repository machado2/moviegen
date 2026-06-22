import { useState } from 'react';
import type {
  BookFormat,
  MontagemFit,
  MontagemOptions,
  PranchaAssemblyStatus,
} from '@moviegen/types';
import { Download, Hammer, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AssemblyProgress } from '@/components/comics/AssemblyProgress';
import { useBookAssembly } from '@/hooks/comics/useBookAssembly';
import { comicsApi } from '@/api/comicsClient';

export interface PublicationProps {
  projectId: string;
}

const DEFAULT_OPTIONS: MontagemOptions = {
  gutterPx: 48,
  background: 'black',
  fit: 'contain',
  canvasWidth: 1800,
  canvasHeight: 2700,
};

function stateBadge(state: PranchaAssemblyStatus['state']) {
  switch (state) {
    case 'assembled':
      return <Badge variant="success">montada</Badge>;
    case 'stale':
      return <Badge variant="warning">desatualizada</Badge>;
    default:
      return <Badge variant="secondary">não montada</Badge>;
  }
}

const FORMATS: BookFormat[] = ['cbz', 'pdf', 'epub'];

export function Publication({ projectId }: PublicationProps) {
  const { status, loading, error, jobs, reload, assemblePrancha, assembleBook } =
    useBookAssembly(projectId);

  const [options, setOptions] = useState<MontagemOptions>(DEFAULT_OPTIONS);

  const jobList = Object.values(jobs);
  const pranchas = status?.pranchas ?? [];

  const setOpt = <K extends keyof MontagemOptions>(
    key: K,
    value: MontagemOptions[K],
  ) => setOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Publicação</h2>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Carregando status…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {jobList.length > 0 && (
        <div className="space-y-2">
          {jobList.map((job) => (
            <AssemblyProgress key={job.id} job={job} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Opções de montagem</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="gutter">Gutter (px)</Label>
            <Input
              id="gutter"
              type="number"
              value={options.gutterPx}
              onChange={(e) => setOpt('gutterPx', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bg">Cor de fundo</Label>
            <Input
              id="bg"
              value={options.background}
              onChange={(e) => setOpt('background', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Fit</Label>
            <Select
              value={options.fit}
              onValueChange={(v) => setOpt('fit', v as MontagemFit)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">contain</SelectItem>
                <SelectItem value="cover">cover</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw">Largura (px)</Label>
            <Input
              id="cw"
              type="number"
              value={options.canvasWidth}
              onChange={(e) => setOpt('canvasWidth', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ch">Altura (px)</Label>
            <Input
              id="ch"
              type="number"
              value={options.canvasHeight}
              onChange={(e) => setOpt('canvasHeight', Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Montagem por prancha</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Título</th>
                <th className="p-2">Renders</th>
                <th className="p-2">Status</th>
                <th className="p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pranchas.map((p) => (
                <tr key={p.pranchaId} className="border-b last:border-0">
                  <td className="p-2">{p.number}</td>
                  <td className="p-2">{p.shortTitle}</td>
                  <td className="p-2">
                    {p.quadrosWithRender}/{p.quadroCount}
                    {!p.ready && p.missingQuadros.length > 0 && (
                      <span className="ml-1 text-xs text-destructive">
                        (faltam: {p.missingQuadros.join(', ')})
                      </span>
                    )}
                  </td>
                  <td className="p-2">{stateBadge(p.state)}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        disabled={!p.ready}
                        onClick={() =>
                          void assemblePrancha(p.pranchaId, options)
                        }
                      >
                        <Hammer className="h-3 w-3" /> Montar
                      </Button>
                      {p.state !== 'not-assembled' && (
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={comicsApi.assembly.pranchaOutputUrl(
                              projectId,
                              p.pranchaId,
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download className="h-3 w-3" /> Download
                          </a>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {pranchas.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Nenhuma prancha para montar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Livro final</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status && !status.ready && (
            <p className="text-sm text-muted-foreground">
              Todas as pranchas precisam estar montadas e atualizadas antes de
              gerar o livro.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {FORMATS.map((f) => (
              <Button
                key={f}
                disabled={!status?.ready}
                onClick={() => void assembleBook([f])}
              >
                <Hammer className="h-4 w-4" /> Gerar {f.toUpperCase()}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {FORMATS.map((f) =>
              status?.outputs[f] ? (
                <Button key={f} variant="outline" asChild>
                  <a
                    href={comicsApi.assembly.bookOutputUrl(projectId, f)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="h-4 w-4" /> Baixar {f.toUpperCase()}
                  </a>
                </Button>
              ) : null,
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Publication;
