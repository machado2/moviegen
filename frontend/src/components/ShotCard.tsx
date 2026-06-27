import { useRef, useState } from 'react';
import type { Project, Scene, Shot } from '@mediagen/types';
import { Copy, Sparkles, Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TakePlayer } from '@/components/TakePlayer';
import { shotPrompt } from '@mediagen/core';
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
  const [confirmShotOpen, setConfirmShotOpen] = useState(false);
  const [takeToDelete, setTakeToDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const generatePrompt = () => {
    setPrompt(shotPrompt(project, scene, shot));
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
            <span>Plano {shot.order}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-normal text-muted-foreground">
              câmera: &ldquo;{shot.camera || '—'}&rdquo;
            </span>
            <span className="text-muted-foreground">·</span>
            <Badge variant="outline">{shot.targetDuration}</Badge>
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">Ação:</span> {shot.action || '—'}
          </p>
          {shot.exit && (
            <p>
              <span className="font-medium">Saída:</span> {shot.exit}
            </p>
          )}
          {shot.lines.length > 0 && (
            <div>
              <span className="font-medium">Falas:</span>
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
              <span className="font-medium">Som:</span>{' '}
              {shot.sounds.join(', ')}
            </p>
          )}
          {shot.diegeticTexts.length > 0 && (
            <p>
              <span className="font-medium">Em tela:</span>{' '}
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
            Tomadas ({shot.takes.length})
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
                onDelete={(takeId) => setTakeToDelete(takeId)}
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
            {uploading ? 'Enviando…' : 'Enviar tomada'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" onClick={generatePrompt}>
            <Sparkles className="h-3 w-3" /> Gerar Prompt
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmShotOpen(true)}
          >
            <Trash2 className="h-3 w-3" /> Apagar plano
          </Button>
        </div>
      </CardContent>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Prompt gerado — Plano {shot.order}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={prompt}
            readOnly
            className="h-[50vh] font-mono text-xs"
          />
          <Button onClick={copyPrompt}>
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmShotOpen} onOpenChange={setConfirmShotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar plano?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O Plano {shot.order} e todas as suas tomadas geradas serão removidos.
            Esta ação é irreversível, exceto pelo Histórico de versões.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmShotOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmShotOpen(false);
                onDeleteShot(shot.id);
              }}
            >
              <Trash2 className="h-4 w-4" /> Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={takeToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTakeToDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar tomada?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta tomada gerada será removida em definitivo. Esta ação é
            irreversível, exceto pelo Histórico de versões.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTakeToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const id = takeToDelete;
                setTakeToDelete(null);
                if (id) void deleteTake(id);
              }}
            >
              <Trash2 className="h-4 w-4" /> Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ShotCard;
