import type { SceneAssemblyStatus } from '@mediagen/types';
import { Clapperboard, Download, Film, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AssemblyProgress } from '@/components/AssemblyProgress';
import { useAssembly } from '@/hooks/useAssembly';
import { api } from '@/api/client';

export interface AssemblyProps {
  projectId: string;
}

function stateBadge(state: SceneAssemblyStatus['state']) {
  switch (state) {
    case 'assembled':
      return <Badge variant="success">assembled</Badge>;
    case 'stale':
      return <Badge variant="warning">stale</Badge>;
    default:
      return <Badge variant="secondary">not assembled</Badge>;
  }
}

export function Assembly({ projectId }: AssemblyProps) {
  const {
    status,
    loading,
    error,
    jobs,
    reload,
    assembleScene,
    assembleMovie,
  } = useAssembly(projectId);

  const jobList = Object.values(jobs);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Assembly</h2>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Loading status…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {jobList.length > 0 && (
        <div className="space-y-2">
          {jobList.map((job) => (
            <AssemblyProgress key={job.id} job={job} />
          ))}
        </div>
      )}

      {status && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scenes</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Title</th>
                    <th className="p-2">Takes</th>
                    <th className="p-2">State</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {status.scenes.map((s) => (
                    <tr key={s.sceneId} className="border-b last:border-0">
                      <td className="p-2">{s.number}</td>
                      <td className="p-2">{s.shortTitle}</td>
                      <td className="p-2">
                        {s.shotsWithTake}/{s.shotCount}
                        {!s.ready && s.missingShots.length > 0 && (
                          <span className="ml-1 text-xs text-destructive">
                            (missing: {s.missingShots.join(', ')})
                          </span>
                        )}
                      </td>
                      <td className="p-2">{stateBadge(s.state)}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            disabled={!s.ready}
                            onClick={() => void assembleScene(s.sceneId)}
                          >
                            <Clapperboard className="h-3 w-3" /> Assemble
                          </Button>
                          {s.state !== 'not-assembled' && (
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={api.assembly.sceneOutputUrl(
                                  projectId,
                                  s.sceneId,
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
                  {status.scenes.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-4 text-center text-muted-foreground"
                      >
                        No scenes to assemble.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Full movie</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!status.ready}
                onClick={() => void assembleMovie()}
              >
                <Film className="h-4 w-4" /> Assemble movie
              </Button>
              {!status.ready && (
                <span className="text-sm text-muted-foreground">
                  All scenes must be assembled and up to date first.
                </span>
              )}
              {status.movieAt && (
                <Button variant="outline" asChild>
                  <a
                    href={api.assembly.movieOutputUrl(projectId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="h-4 w-4" /> Download movie
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default Assembly;
