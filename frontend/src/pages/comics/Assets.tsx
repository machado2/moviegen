import { useCallback, useEffect, useState } from 'react';
import type { ComicsAsset, ComicsAssetRole } from '@moviegen/types';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface AssetsProps {
  projectId: string;
}

const ROLES: ComicsAssetRole[] = ['character', 'style-reference', 'location'];

export function Assets({ projectId }: AssetsProps) {
  const [assets, setAssets] = useState<ComicsAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await comicsApi.assets.list(projectId));
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFor = async (assetId: string, file: File) => {
    await comicsApi.assets.upload(projectId, assetId, file);
    await load();
  };

  const remove = async (assetId: string) => {
    await comicsApi.assets.remove(projectId, assetId);
    await load();
  };

  const filtered = assets.filter(
    (a) => roleFilter === 'all' || a.role === roleFilter,
  );

  if (loading)
    return <p className="text-muted-foreground">Carregando assets…</p>;
  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Novo asset
        </Button>
        <Button
          variant="outline"
          onClick={() => comicsApi.projects.export(projectId)}
        >
          <Download className="h-4 w-4" /> Exportar ZIP
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
                <th className="p-2">Role</th>
                <th className="p-2">Status</th>
                <th className="p-2">Personagem</th>
                <th className="p-2">Arquivo</th>
                <th className="p-2">Ações</th>
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
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Nenhum asset corresponde aos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CreateAssetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}

interface AssetRowProps {
  projectId: string;
  asset: ComicsAsset;
  onUpload: (assetId: string, file: File) => void;
  onRemove: (assetId: string) => void;
}

function AssetRow({ projectId, asset, onUpload, onRemove }: AssetRowProps) {
  const inputId = `comics-asset-upload-${asset.id}`;
  return (
    <tr className="border-b last:border-0">
      <td className="p-2 font-mono text-xs">{asset.id}</td>
      <td className="p-2">{asset.role}</td>
      <td className="p-2">
        <Badge variant="outline">{asset.status}</Badge>
      </td>
      <td className="p-2">{asset.characterName ?? '—'}</td>
      <td className="p-2">
        {asset.file ? (
          <a
            className="text-primary underline"
            href={comicsApi.assets.fileUrl(projectId, asset.id)}
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
            accept="image/*"
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
            onClick={() => onRemove(asset.id)}
            title="Deletar"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

interface CreateAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated: () => void;
}

function CreateAssetDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: CreateAssetDialogProps) {
  const [role, setRole] = useState<ComicsAssetRole>('character');
  const [characterName, setCharacterName] = useState('');
  const [characterDescription, setCharacterDescription] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await comicsApi.assets.create(projectId, {
        role,
        characterName: characterName.trim() || undefined,
        characterDescription: characterDescription.trim() || undefined,
        description: description.trim() || undefined,
      });
      setRole('character');
      setCharacterName('');
      setCharacterDescription('');
      setDescription('');
      onCreated();
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as ComicsAssetRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === 'character' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="charName">Nome do personagem</Label>
                <Input
                  id="charName"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="charDesc">Descrição canônica</Label>
                <Input
                  id="charDesc"
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="assetDesc">Notas</Label>
            <Input
              id="assetDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={creating} onClick={() => void create()}>
            {creating ? 'Criando…' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Assets;
