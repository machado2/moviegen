import { useRef, useState } from 'react';
import type { Project, Scene, Shot } from '@mediagen/types';
import { Copy, Sparkles, Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TakePlayer } from '@/components/TakePlayer';
import { buildShotPrompt } from '@/lib/prompt';
import { api } from '@/api/client';

export interface ShotCardProps {
  project: Project;
  scene: Scene;
  shot: Shot;
  onSelectTake: (shotId: string, takeId: string | null) => void;
  onDeleteShot: (shotId: string) => void;
  onChanged: () => void;
}

export function ShotCard({
  project,
  scene,
  shot,
  onSelectTake,
  onDeleteShot,
  onChanged,
}: ShotCardProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const generatePrompt = () => {
    setPrompt(buildShotPrompt(project, scene, shot));
    setPromptOpen(true);
  };

  const copyPrompt = () => {
    void navigator.clipboard.writeText(prompt);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await api.takes.upload(project.id, scene.id, shot.id, file);
      onChanged();
    } finally {
      setUploading(false);
    }
  };

  const deleteTake = async (takeId: string) => {
    await api.takes.remove(project.id, scene.id, shot.id, takeId);
    onChanged();
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>Shot {shot.order}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-normal text-muted-foreground">
              camera: &ldquo;{shot.camera || '—'}&rdquo;
            </span>
            <span className="text-muted-foreground">·</span>
            <Badge variant="outline">{shot.targetDuration}</Badge>
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">Action:</span> {shot.action || '—'}
          </p>
          {shot.exit && (
            <p>
              <span className="font-medium">Exit:</span> {shot.exit}
            </p>
          )}
          {shot.lines.length > 0 && (
            <div>
              <span className="font-medium">Lines:</span>
              <ul className="ml-1">
                {shot.lines.map((l, i) => (
                  <li key={i} className="text-muted-foreground">
                    [{l.speaker.toUpperCase()}
                    {l.type === 'voice-over' ? ' V.O.' : ''}] {l.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shot.sounds.length > 0 && (
            <p>
              <span className="font-medium">Sound:</span>{' '}
              {shot.sounds.join(', ')}
            </p>
          )}
          {shot.diegeticTexts.length > 0 && (
            <p>
              <span className="font-medium">On-screen:</span>{' '}
              {shot.diegeticTexts.join(', ')}
            </p>
          )}
          {shot.refs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-medium">Assets:</span>
              {shot.refs.map((ref) => {
                const asset = project.assets[ref.assetId];
                return (
                  <Badge
                    key={ref.assetId}
                    variant={asset?.status === 'active' ? 'success' : 'secondary'}
                  >
                    {ref.assetId}
                    {asset?.status === 'active' ? ' ✓' : ''}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-medium">
            Takes ({shot.takes.length})
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shot.takes.map((take) => (
              <TakePlayer
                key={take.id}
                projectId={project.id}
                sceneId={scene.id}
                shotId={shot.id}
                take={take}
                selected={shot.selectedTakeId === take.id}
                onSelect={(takeId) => onSelectTake(shot.id, takeId)}
                onDelete={deleteTake}
              />
            ))}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
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
            className="mt-2"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-3 w-3" />
            {uploading ? 'Uploading…' : 'Upload take'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" onClick={generatePrompt}>
            <Sparkles className="h-3 w-3" /> Generate Prompt
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDeleteShot(shot.id)}
          >
            <Trash2 className="h-3 w-3" /> Delete shot
          </Button>
        </div>
      </CardContent>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Generated prompt — Shot {shot.order}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={prompt}
            readOnly
            className="h-[50vh] font-mono text-xs"
          />
          <Button onClick={copyPrompt}>
            <Copy className="h-4 w-4" /> Copy to clipboard
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ShotCard;
