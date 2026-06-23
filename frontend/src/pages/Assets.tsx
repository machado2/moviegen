import { useCallback, useEffect, useState } from 'react';
import type { Asset, AssetRole, AssetType } from '@mediagen/types';
import { Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiClientError } from '@/api/client';

export interface AssetsProps {
  projectId: string;
}

const ROLES: AssetRole[] = [
  'character-face',
  'character-body',
  'character-concept',
  'voice',
  'voice-over',
  'location',
  'ambient-sound',
];
const TYPES: AssetType[] = ['image', 'audio', 'video'];

export function Assets({ projectId }: AssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await api.assets.list(projectId));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFor = async (assetId: string, file: File) => {
    await api.assets.upload(projectId, assetId, file);
    await load();
  };

  const remove = async (assetId: string) => {
    await api.assets.remove(projectId, assetId);
    await load();
  };

  const generate = async (assetId: string) => {
    await api.assets.generate(projectId, assetId);
    await load();
  };

  const filtered = assets.filter(
    (a) =>
      (typeFilter === 'all' || a.type === typeFilter) &&
      (roleFilter === 'all' || a.role === roleFilter),
  );

  if (loading) return <p className="text-muted-foreground">Loading assets…</p>;
  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => void api.projects.export(projectId)}
        >
          <Download className="h-4 w-4" /> Bulk download ZIP
        </Button>
        <span className="text-sm text-muted-foreground">
          {filtered.length} asset{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Type</th>
                <th className="p-2">Role</th>
                <th className="p-2">Status</th>
                <th className="p-2">Character</th>
                <th className="p-2">File</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <AssetRow
                  key={a.id}
                  projectId={projectId}
                  asset={a}
                  onUpload={uploadFor}
                  onRemove={remove}
                  onGenerate={generate}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No assets match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

interface AssetRowProps {
  projectId: string;
  asset: Asset;
  onUpload: (assetId: string, file: File) => void;
  onRemove: (assetId: string) => void;
  onGenerate: (assetId: string) => void;
}

function AssetRow({
  projectId,
  asset,
  onUpload,
  onRemove,
  onGenerate,
}: AssetRowProps) {
  const inputId = `asset-upload-${asset.id}`;
  return (
    <tr className="border-b last:border-0">
      <td className="p-2 font-mono text-xs">{asset.id}</td>
      <td className="p-2">{asset.type}</td>
      <td className="p-2">{asset.role}</td>
      <td className="p-2">
        <Badge variant="outline">{asset.status}</Badge>
      </td>
      <td className="p-2">{asset.characterName ?? '—'}</td>
      <td className="p-2">
        {asset.file ? (
          <a
            className="text-primary underline"
            href={api.assets.fileUrl(projectId, asset.id)}
            target="_blank"
            rel="noreferrer"
          >
            download
          </a>
        ) : (
          '—'
        )}
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <input
            id={inputId}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(asset.id, f);
              e.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => document.getElementById(inputId)?.click()}
            title="Upload"
          >
            <Upload className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onGenerate(asset.id)}
            title="Generate"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(asset.id)}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default Assets;
