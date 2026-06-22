import { useCallback, useEffect, useState } from 'react';
import type { Asset, Character } from '@moviegen/types';
import { CharacterCard } from '@/components/CharacterCard';
import { api, ApiClientError } from '@/api/client';

export interface CharactersProps {
  projectId: string;
}

export function Characters({ projectId }: CharactersProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [assets, setAssets] = useState<Record<string, Asset>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chars, assetList] = await Promise.all([
        api.characters.list(projectId),
        api.assets.list(projectId),
      ]);
      setCharacters(chars);
      const map: Record<string, Asset> = {};
      for (const a of assetList) map[a.id] = a;
      setAssets(map);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-muted-foreground">Loading characters…</p>;
  if (error) return <p className="text-destructive">{error}</p>;
  if (characters.length === 0)
    return (
      <p className="text-muted-foreground">
        No characters yet. Parse a script or add character assets.
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {characters.map((c) => (
        <CharacterCard
          key={c.id}
          projectId={projectId}
          character={c}
          assets={assets}
          onChanged={() => void load()}
        />
      ))}
    </div>
  );
}

export default Characters;
