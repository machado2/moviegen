import { useCallback, useEffect, useRef, useState } from 'react';
import type { Outline, ProjectDTO } from '@mediagen/types';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { Loader2, Send, Sparkles, Square, Trash2, Users, Film } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiClientError } from '@/api/client';

export interface CoCreateProps {
  project: ProjectDTO;
  onChanged: () => void;
}

// Render the text content of a UIMessage (we only produce text parts server-side).
function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

// The co-creation workspace: a streaming chat (left) that builds the project,
// next to a live structure panel (right) that reflects the outline, characters
// and scenes as the agent mutates them. Each tool call commits to disk, so the
// panel polling while a turn streams shows the structure growing in real time.
export function CoCreate({ project, onChanged }: CoCreateProps) {
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumping this remounts the chat with fresh initial messages (after a clear).
  const [resetKey, setResetKey] = useState(0);

  const refreshOutline = useCallback(async () => {
    try {
      setOutline(await api.cocreate.outline(project.id));
    } catch {
      /* leave the last outline visible */
    }
  }, [project.id]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [thread, ol] = await Promise.all([
          api.cocreate.chatThread(project.id),
          api.cocreate.outline(project.id),
        ]);
        if (!alive) return;
        setInitial(
          thread.messages.map((m) => ({
            id: m.id,
            role: m.role,
            parts: [{ type: 'text', text: m.content }],
          })),
        );
        setOutline(ol);
        setReady(true);
      } catch (e) {
        if (alive) setLoadError(e instanceof ApiClientError ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [project.id, resetKey]);

  const clearConversation = async () => {
    try {
      await api.cocreate.clearChat(project.id);
      setReady(false);
      setInitial([]);
      setResetKey((k) => k + 1);
    } catch (e) {
      setLoadError(e instanceof ApiClientError ? e.message : String(e));
    }
  };

  if (loadError) return <p className="text-sm text-destructive">Falha ao carregar a co-criação: {loadError}</p>;
  if (!ready) return <p className="text-sm text-muted-foreground">Carregando co-criação…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <ChatPane
        key={resetKey}
        projectId={project.id}
        initialMessages={initial}
        onActivity={refreshOutline}
        onTurnDone={() => {
          void refreshOutline();
          onChanged();
        }}
        onClear={() => void clearConversation()}
      />
      <StructurePanel project={project} outline={outline} />
    </div>
  );
}

interface ChatPaneProps {
  projectId: string;
  initialMessages: UIMessage[];
  onActivity: () => void;     // called periodically while streaming (live panel)
  onTurnDone: () => void;     // called when a turn finishes
  onClear: () => void;
}

function ChatPane({ projectId, initialMessages, onActivity, onTurnDone, onClear }: ChatPaneProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: api.cocreate.chatUrl(projectId) }),
    messages: initialMessages,
    onFinish: () => onTurnDone(),
  });

  const streaming = status === 'streaming' || status === 'submitted';

  // Poll the structure panel while a turn streams — each tool call has already
  // committed, so the outline/scenes appear as they're created.
  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(onActivity, 1500);
    return () => clearInterval(t);
  }, [streaming, onActivity]);

  // Keep the transcript scrolled to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void sendMessage({ text });
  };

  return (
    <Card className="flex h-[calc(100vh-12rem)] flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Co-criação do roteiro
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={streaming} className="gap-1 text-muted-foreground">
          <Trash2 className="h-3.5 w-3.5" /> Limpar
        </Button>
      </CardHeader>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Comece a conversar: descreva a ideia, o tom, os personagens. A IA vai propor logline,
            beats e montar a estrutura junto com você.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ' +
                (m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/40')
              }
            >
              {messageText(m) || (streaming ? '…' : '')}
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">Erro: {error.message}</p>}
      </div>

      <CardContent className="border-t pt-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter quebra linha)"
            className="min-h-[44px] flex-1 resize-none"
          />
          {streaming ? (
            <Button variant="destructive" onClick={() => stop()} className="gap-1">
              <Square className="h-4 w-4" /> Parar
            </Button>
          ) : (
            <Button onClick={send} disabled={!input.trim()} className="gap-1">
              <Send className="h-4 w-4" /> Enviar
            </Button>
          )}
        </div>
        {streaming && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> A IA está trabalhando e atualizando a estrutura…
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StructurePanel({ project, outline }: { project: ProjectDTO; outline: Outline | null }) {
  const characters = Object.values(project.assets)
    .filter((a) => a.role === 'character-concept')
    .map((a) => ({ id: a.id, name: a.characterName ?? a.id }));
  const scenes = [...project.scenes].sort((a, b) => a.number - b.number);

  return (
    <Card className="h-[calc(100vh-12rem)] overflow-y-auto">
      <CardHeader className="py-3">
        <CardTitle className="text-base">Estrutura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logline</h4>
          <p className={outline?.logline ? '' : 'text-muted-foreground'}>{outline?.logline || '(ainda não definida)'}</p>
        </section>

        {outline && outline.themes.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temas</h4>
            <div className="flex flex-wrap gap-1">
              {outline.themes.map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs">{t}</span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outline</h4>
          {outline && outline.acts.length > 0 ? (
            <div className="space-y-2">
              {outline.acts.map((act) => (
                <div key={act.number}>
                  <p className="font-medium">Ato {act.number} — {act.title}</p>
                  <ul className="ml-3 mt-0.5 space-y-0.5">
                    {act.beats.map((b) => (
                      <li key={b.id} className="text-muted-foreground">
                        <span className="text-foreground">{b.title}</span>
                        {b.sceneNumbers.length > 0 && (
                          <span className="ml-1 text-xs text-primary">→ cenas {b.sceneNumbers.join(', ')}</span>
                        )}
                        {b.summary && <span className="block text-xs">{b.summary}</span>}
                      </li>
                    ))}
                    {act.beats.length === 0 && <li className="text-xs text-muted-foreground">(sem beats)</li>}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">(sem atos ainda)</p>
          )}
        </section>

        <section>
          <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Personagens ({characters.length})
          </h4>
          {characters.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {characters.map((c) => (
                <span key={c.id} className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs">{c.name}</span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">(nenhum)</p>
          )}
        </section>

        <section>
          <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Film className="h-3 w-3" /> Cenas ({scenes.length})
          </h4>
          {scenes.length > 0 ? (
            <ol className="space-y-0.5">
              {scenes.map((s) => (
                <li key={s.id} className="text-muted-foreground">
                  <span className="text-foreground">#{s.number}</span> {s.shortTitle}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">(nenhuma)</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export default CoCreate;
