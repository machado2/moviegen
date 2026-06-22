import { useRef } from 'react';
import type { Asset, Character } from '@moviegen/types';
import { Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';

export interface CharacterCardProps {
  projectId: string;
  character: Character;
  assets: Record<string, Asset>;
  onChanged: () => void;
}

interface SlotProps {
  projectId: string;
  label: string;
  assetId: string | null;
  asset: Asset | undefined;
  kind: 'image' | 'audio';
  onChanged: () => void;
}

function AssetSlot({
  projectId,
  label,
  assetId,
  asset,
  kind,
  onChanged,
}: SlotProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!assetId) return;
    await api.assets.upload(projectId, assetId, file);
    onChanged();
  };

  const handleGenerate = async () => {
    if (!assetId) return;
    await api.assets.generate(projectId, assetId);
    onChanged();
  };

  const fileUrl =
    assetId && asset?.file ? api.assets.fileUrl(projectId, assetId) : null;

  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        {!asset && <Badge variant="warning">Pending</Badge>}
        {asset && <Badge variant="outline">{asset.status}</Badge>}
      </div>

      <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded bg-muted">
        {fileUrl && kind === 'image' && (
          <img src={fileUrl} alt={label} className="h-full w-full object-cover" />
        )}
        {fileUrl && kind === 'audio' && (
          <audio src={fileUrl} controls className="w-full px-1" />
        )}
        {!fileUrl && (
          <span className="text-xs text-muted-foreground">No file</span>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={kind === 'image' ? 'image/*' : 'audio/*'}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!assetId}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-3 w-3" /> Upload
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!assetId}
          onClick={() => void handleGenerate()}
        >
          <Sparkles className="h-3 w-3" /> Generate
        </Button>
      </div>
    </div>
  );
}

export function CharacterCard({
  projectId,
  character,
  assets,
  onChanged,
}: CharacterCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{character.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{character.description}</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        <AssetSlot
          projectId={projectId}
          label="Face"
          assetId={character.faceAssetId}
          asset={
            character.faceAssetId ? assets[character.faceAssetId] : undefined
          }
          kind="image"
          onChanged={onChanged}
        />
        <AssetSlot
          projectId={projectId}
          label="Body"
          assetId={character.bodyAssetId}
          asset={
            character.bodyAssetId ? assets[character.bodyAssetId] : undefined
          }
          kind="image"
          onChanged={onChanged}
        />
        <AssetSlot
          projectId={projectId}
          label="Voice"
          assetId={character.voiceAssetId}
          asset={
            character.voiceAssetId ? assets[character.voiceAssetId] : undefined
          }
          kind="audio"
          onChanged={onChanged}
        />
        <AssetSlot
          projectId={projectId}
          label="Concept"
          assetId={character.conceptAssetId}
          asset={
            character.conceptAssetId
              ? assets[character.conceptAssetId]
              : undefined
          }
          kind="image"
          onChanged={onChanged}
        />
      </CardContent>
    </Card>
  );
}

export default CharacterCard;
