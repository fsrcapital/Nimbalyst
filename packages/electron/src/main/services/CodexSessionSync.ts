/** Import normalized Codex rollout messages into Nimbalyst's raw transcript log. */

import { type SessionStore } from '@nimbalyst/runtime';
import type { AgentMessagesStore } from '@nimbalyst/runtime/storage/repositories/AgentMessagesRepository';
import { DEFAULT_MODELS } from '@nimbalyst/runtime/ai/modelConstants';
import { logger } from '../utils/logger';
import { parseCodexRollout, type CodexSessionMetadata } from './CodexSessionScanner';

const log = logger.aiSession;

export interface CodexSyncResult {
  sessionId: string;
  success: boolean;
  error?: string;
  messagesAdded: number;
}

function importedModel(model: string | undefined): string {
  if (!model?.trim()) return DEFAULT_MODELS['openai-codex'];
  return model.startsWith('openai-codex:') ? model : `openai-codex:${model}`;
}

export async function syncCodexSession(
  sessionStore: SessionStore,
  messagesStore: AgentMessagesStore,
  metadata: CodexSessionMetadata,
): Promise<CodexSyncResult> {
  try {
    const parsed = await parseCodexRollout(metadata.filePath);
    if (!parsed) throw new Error('The Codex rollout no longer contains valid session metadata.');
    const fullMetadata = parsed.metadata;
    const existingSession = await sessionStore.get(fullMetadata.sessionId);
    const existingMessages = existingSession ? await messagesStore.list(fullMetadata.sessionId) : [];

    if (!existingSession) {
      await sessionStore.create({
        id: fullMetadata.sessionId,
        workspaceId: fullMetadata.workspacePath,
        provider: 'openai-codex',
        model: importedModel(fullMetadata.model),
        title: fullMetadata.title,
        sessionType: 'session',
        providerSessionId: fullMetadata.sessionId,
        providerConfig: {
          imported: true,
          importedAt: Date.now(),
          importSource: 'codex-rollout',
          tokenUsage: fullMetadata.tokenUsage,
        },
        createdAt: fullMetadata.createdAt,
        updatedAt: metadata.updatedAt,
      });
    } else {
      await sessionStore.updateMetadata(fullMetadata.sessionId, {
        title: fullMetadata.title || existingSession.title,
        metadata: {
          ...(existingSession.metadata ?? {}),
          tokenUsage: fullMetadata.tokenUsage,
        },
      });
    }

    const toImport = parsed.messages.slice(existingMessages.length);
    for (const message of toImport) {
      await messagesStore.create({
        sessionId: fullMetadata.sessionId,
        source: 'codex-import',
        direction: message.direction,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt,
      });
    }
    return { sessionId: fullMetadata.sessionId, success: true, messagesAdded: toImport.length };
  } catch (error) {
    log.error(`[CodexSessionSync] Failed to import ${metadata.sessionId}:`, error);
    return {
      sessionId: metadata.sessionId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      messagesAdded: 0,
    };
  }
}

export async function syncCodexSessions(
  sessionStore: SessionStore,
  messagesStore: AgentMessagesStore,
  sessions: CodexSessionMetadata[],
): Promise<CodexSyncResult[]> {
  const results: CodexSyncResult[] = [];
  for (const session of sessions) results.push(await syncCodexSession(sessionStore, messagesStore, session));
  return results;
}
