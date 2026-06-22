import { useRef } from 'react';
import type { Asset } from '@moviegen/types';
import { Sparkles, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';

export interface AssetCardProps {
  projectId: string;
  asset: Asset;
  onChanged: () => void;
}

function statusVariant(
  status: Asset['status'],
): 'success' | 'warning' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending':
      return 'warning';
    case 'external':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function AssetCard({ projectId, asset, onChanged }: AssetCardProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const fileUrl = api.assets.fileUrl(projectId, asset.id);

  const handleUpload = async (file: File) => {
    await api.assets.upload(projectId, asset.id, file);
    onChanged();
  };

  const handleGenerate = async () => {
    await api.assets.generate(projectId, asset.id);
    onChanged();
  };

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="aspect-video w-full overflow-hidden rounded bg-muted">
          {asset.file && asset.type === 'image' && (
            <img
              src={fileUrl}
              alt={asset.id}
              className="h-full w-full object-cover"
            />
          )}
          {asset.file && asset.type === 'video' && (
            <video src={fileUrl} controls className="h-full w-full" />
          )}
          {asset.file && asset.type === 'audio' && (
            <div className="flex h-full items-center justify-center p-2">
              <audio src={fileUrl} controls className="w-full" />
            </div>
          )}
          {!asset.file && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No file
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs" title={asset.id}>
            {asset.id}
          </span>
          <Badge variant={statusVariant(asset.status)}>{asset.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <Badge variant="outline">{asset.type}</Badge>
          <Badge variant="outline">{asset.role}</Badge>
          {asset.characterName && (
            <Badge variant="secondary">{asset.characterName}</Badge>
          )}
        </div>
        {asset.description && (
          <p className="text-xs text-muted-foreground">{asset.description}</p>
        )}

        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-3 w-3" /> Upload
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void handleGenerate()}>
            <Sparkles className="h-3 w-3" /> Generate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default AssetCard;
