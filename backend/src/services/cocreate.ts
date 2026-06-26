// Co-creation persistence: the outline/beat sheet and the chat transcript, both
// per-project Nickel files. This module is the storage layer for the co-creation
// feature; the agent that drives the conversation and mutates these (TASK-10.3)
// builds on top of these read/write helpers.

import type { ChatMessage, ChatThread, Outline, OutlineAct, OutlineBeat } from '@mediagen/types';
import * as fs from '../storage/filesystem.js';
import { getProject } from './project.js';
import { newId } from '../lib/ids.js';
import { badRequest } from '../lib/errors.js';

function emptyOutline(): Outline {
  return { logline: '', themes: [], acts: [], updatedAt: new Date().toISOString() };
}
function emptyThread(): ChatThread {
  return { messages: [], updatedAt: new Date().toISOString() };
}

// ─── Outline ─────────────────────────────────────────────────────────────────

/** The project's outline, or an empty one if none has been written yet. */
export async function getOutline(projectId: string): Promise<Outline> {
  await getProject(projectId); // 404 if missing
  if (!(await fs.pathExists(fs.outlineFile(projectId)))) return emptyOutline();
  return fs.readNickel<Outline>(fs.outlineFile(projectId));
}

/** Persist the outline wholesale and version it. */
export async function saveOutline(projectId: string, outline: Outline): Promise<Outline> {
  await getProject(projectId);
  const next: Outline = {
    logline: outline.logline ?? '',
    themes: Array.isArray(outline.themes) ? outline.themes : [],
    acts: normalizeActs(outline.acts),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeNickel(fs.outlineFile(projectId), next);
  await fs.commitProject(projectId, 'outline: atualizado');
  return next;
}

// Defensive normalization so a hand-edited or partial outline can't break the
// shape (same spirit as the rest of the codebase: validate, don't trust input).
function normalizeActs(acts: unknown): OutlineAct[] {
  if (!Array.isArray(acts)) return [];
  return acts.map((a, i) => {
    const act = (a ?? {}) as Partial<OutlineAct>;
    return {
      number: Number.isFinite(act.number) ? Number(act.number) : i + 1,
      title: typeof act.title === 'string' ? act.title : `Ato ${i + 1}`,
      beats: normalizeBeats(act.beats),
    };
  });
}
function normalizeBeats(beats: unknown): OutlineBeat[] {
  if (!Array.isArray(beats)) return [];
  return beats.map((b) => {
    const beat = (b ?? {}) as Partial<OutlineBeat>;
    return {
      id: typeof beat.id === 'string' && beat.id ? beat.id : newId('beat'),
      title: typeof beat.title === 'string' ? beat.title : '',
      summary: typeof beat.summary === 'string' ? beat.summary : '',
      sceneNumbers: Array.isArray(beat.sceneNumbers)
        ? beat.sceneNumbers.filter((n): n is number => Number.isFinite(n))
        : [],
    };
  });
}

// ─── Chat thread ─────────────────────────────────────────────────────────────

/** The project's co-creation chat transcript, or an empty one. */
export async function getChatThread(projectId: string): Promise<ChatThread> {
  await getProject(projectId);
  if (!(await fs.pathExists(fs.chatThreadFile(projectId)))) return emptyThread();
  return fs.readNickel<ChatThread>(fs.chatThreadFile(projectId));
}

/** Replace the whole thread (used by the agent after a turn). */
export async function saveChatThread(projectId: string, thread: ChatThread): Promise<ChatThread> {
  await getProject(projectId);
  const next: ChatThread = {
    messages: Array.isArray(thread.messages) ? thread.messages : [],
    updatedAt: new Date().toISOString(),
  };
  await fs.writeNickel(fs.chatThreadFile(projectId), next);
  return next;
}

/** Append one message and persist. Returns the updated thread. */
export async function appendChatMessage(
  projectId: string,
  message: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
): Promise<ChatThread> {
  if (message.role !== 'user' && message.role !== 'assistant') {
    throw badRequest('Chat message role must be "user" or "assistant"');
  }
  const thread = await getChatThread(projectId);
  thread.messages.push({
    id: message.id ?? newId('msg'),
    role: message.role,
    content: message.content ?? '',
    toolEvents: message.toolEvents,
    createdAt: message.createdAt ?? new Date().toISOString(),
  });
  return saveChatThread(projectId, thread);
}

/** Wipe the co-creation chat transcript (outline is left intact). */
export async function clearChatThread(projectId: string): Promise<ChatThread> {
  await getProject(projectId);
  if (await fs.pathExists(fs.chatThreadFile(projectId))) await fs.remove(fs.chatThreadFile(projectId));
  return emptyThread();
}
