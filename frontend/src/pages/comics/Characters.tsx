import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComicsAsset, ComicsCharacter } from '@mediagen/types';
import { Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { comicsApi, ComicsApiError } from '@/api/comicsClient';

export interface CharactersProps {
  projectId: string;
}

export function Characters({ projectId }: CharactersProps) {
  const [characters, setCharacters] = useState<ComicsCharacter[]>([]);
  const [assets, setAssets] = useState<Record<string, ComicsAsset>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chars, assetList] = await Promise.all([
        comicsApi.characters.list(projectId),
        comicsApi.assets.list(projectId),
      ]);
      setCharacters(chars);
      const map: Record<string, ComicsAsset> = {};
      for (const a of assetList) map[a.id] = a;
      setAssets(map);
    } catch (e) {
      setError(e instanceof ComicsApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return <p className="text-muted-foreground">Carregando personagens…</p>;
  if (error) return <p className="text-destructive">{error}</p>;
  if (characters.length === 0)
    return (
      <p className="text-muted-foreground">
        Nenhum personagem ainda. Parseie um roteiro ou adicione assets de
        personagem.
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {characters.map((c) => (
        <CharacterCard
          key={c.id}
          projectId={projectId}
          character={c}
          asset={c.assetId ? assets[c.assetId] : undefined}
          onChanged={() => void load()}
        />
      ))}
    </div>
  );
}

interface CharacterCardProps {
  projectId: string;
  character: ComicsCharacter;
  asset: ComicsAsset | undefined;
  onChanged: () => void;
}

function CharacterCard({
  projectId,
  character,
  asset,
  onChanged,
}: CharacterCardProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!character.assetId) return;
    await comicsApi.assets.upload(projectId, character.assetId, file);
    onChanged();
  };

  const fileUrl =
    character.assetId && asset?.file
      ? comicsApi.assets.fileUrl(projectId, character.assetId)
      : null;

  const active = asset?.status === 'active';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {character.name}
          <Badge variant={active ? 'success' : 'warning'}>
            {active ? 'Ativo' : 'Pendente'}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{character.description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex h-40 items-center justify-center overflow-hidden rounded bg-muted">
          {fileUrl ? (
            <img
              src={fileUrl}
              alt={character.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">Sem imagem</span>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!character.assetId}
          onClick={() => fileInput.current?.click()}
          title={
            character.assetId
              ? undefined
              : 'Crie um asset de personagem na aba Assets primeiro'
          }
        >
          <Upload className="h-3 w-3" /> Upload de imagem
        </Button>
      </CardContent>
    </Card>
  );
}

export default Characters;
