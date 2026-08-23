/**
 * Boot-time quarantine of stranded queues.
 *
 * A pending prompt from a previous app run must never start merely because the
 * user later opens its workspace or views its transcript. Re-driving those
 * rows used to arm QueueDriveService's no-window retry; once a window appeared,
 * the oldest prompt was submitted to the provider without a fresh user action.
 * For a large resumed Claude/Codex session that can consume substantial usage.
 *
 * `sweepExecutingOnBoot` already normalizes rows left mid-flight at quit
 * (delivered-and-answered → completed, delivered-but-unanswered → failed,
 * never-delivered → pending). Quarantine the remaining `pending` rows as
 * failed. They remain in queue history with an actionable explanation, and the
 * user can explicitly send the prompt again if it is still wanted.
 */

export const RESTARTED_PROMPT_ERROR =
  'Not executed after Nimbalyst restarted. Send the prompt again to run it.';

export interface BootQueueRecoveryDeps {
  listSessionIdsWithPending(): Promise<string[]>;
  failPending(sessionId: string, errorMessage: string): Promise<number>;
  logInfo(message: string): void;
}

/** Returns the number of sessions whose pre-restart queues were quarantined. */
export async function driveStrandedQueuesOnBoot(deps: BootQueueRecoveryDeps): Promise<number> {
  const sessionIds = await deps.listSessionIdsWithPending();
  if (sessionIds.length === 0) return 0;

  deps.logInfo(`[Main] Boot recovery: quarantining pending prompts for ${sessionIds.length} session(s)`);

  let quarantined = 0;
  for (const sessionId of sessionIds) {
    const failed = await deps.failPending(sessionId, RESTARTED_PROMPT_ERROR);
    if (failed > 0) {
      quarantined += 1;
      deps.logInfo(
        `[Main] Boot recovery: quarantined ${failed} pending prompt(s) for session ${sessionId}`,
      );
    }
  }

  return quarantined;
}
