/** IPC handlers for importing resumable Codex rollout histories. */

import { AISessionsRepository, AgentMessagesRepository } from '@nimbalyst/runtime';
import { logger } from '../utils/logger';
import { safeHandle, removeHandler } from '../utils/ipcRegistry';
import { scanCodexSessions } from '../services/CodexSessionScanner';
import { syncCodexSessions } from '../services/CodexSessionSync';

const log = logger.ipc;

async function existingProviderSessions(workspacePath: string): Promise<Map<string, { updatedAt: number }>> {
  const sessionStore = AISessionsRepository.getStore();
  const result = new Map<string, { updatedAt: number }>();
  const sessions = await sessionStore.list(workspacePath);
  await Promise.all(sessions.map(async (session) => {
    const full = await sessionStore.get(session.id);
    if (full?.providerSessionId) result.set(full.providerSessionId, { updatedAt: full.updatedAt });
  }));
  return result;
}

export function initializeCodexSessionHandlers(): void {
  safeHandle('codex:scan-sessions', async (_event, { workspacePath }: { workspacePath?: string }) => {
    try {
      const sessions = await scanCodexSessions({ workspacePath });
      const maps = new Map<string, Map<string, { updatedAt: number }>>();
      await Promise.all([...new Set(sessions.map((session) => session.workspacePath))].map(async (workspace) => {
        maps.set(workspace, await existingProviderSessions(workspace));
      }));
      return {
        success: true,
        sessions: sessions.map((session) => {
          const existing = maps.get(session.workspacePath)?.get(session.sessionId);
          const syncStatus = !existing
            ? 'new'
            : session.updatedAt > existing.updatedAt + 1_000 ? 'needs-update' : 'up-to-date';
          return { ...session, syncStatus };
        }),
      };
    } catch (error) {
      log.error('[CodexSessionHandlers] Failed to scan sessions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  safeHandle('codex:sync-sessions', async (_event, input: { sessionIds: string[]; workspacePath?: string }) => {
    try {
      let sessions = await scanCodexSessions({ workspacePath: input.workspacePath });
      let requested = sessions.filter((session) => input.sessionIds.includes(session.sessionId));
      if (requested.length === 0 && input.workspacePath) {
        sessions = await scanCodexSessions();
        requested = sessions.filter((session) => input.sessionIds.includes(session.sessionId));
      }
      if (requested.length === 0) return { success: false, error: 'No Codex sessions found to import.' };
      const results = await syncCodexSessions(
        AISessionsRepository.getStore(),
        AgentMessagesRepository.getStore(),
        requested,
      );
      const successCount = results.filter((result) => result.success).length;
      const failureCount = results.length - successCount;
      if (successCount === 0) {
        return {
          success: false,
          error: results.find((result) => result.error)?.error ?? 'All Codex sessions failed to import.',
          results,
        };
      }
      return { success: true, successCount, failureCount, results };
    } catch (error) {
      log.error('[CodexSessionHandlers] Failed to import sessions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  log.info('Codex session import handlers initialized');
}

export function cleanupCodexSessionHandlers(): void {
  removeHandler('codex:scan-sessions');
  removeHandler('codex:sync-sessions');
}
