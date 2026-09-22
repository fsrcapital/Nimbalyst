/**
 * NIM-806 Phase 1 — input routing for the genuine Claude CLI session type.
 *
 * A `claude-code-cli` session renders the real interactive `claude` CLI in the
 * ghostty-web terminal strip (see SessionTranscript.tsx). That CLI is driven by
 * the PTY, NOT by the Agent SDK loop, so the chat input box must write straight
 * to the terminal instead of calling `ai:sendMessage` (which throws
 * "Phase 1 not implemented" for this provider and silently queues the prompt).
 *
 * These helpers encode the routing decision so it can be unit-tested without
 * the full SessionTranscript component.
 */

/** Provider id whose input box routes to the terminal PTY. */
export const CLAUDE_CLI_PROVIDER_ID = 'claude-code-cli';

/** True when the session's provider is the genuine terminal-backed Claude CLI. */
export function isClaudeCliTerminalSession(provider: string | null | undefined): boolean {
  return provider === CLAUDE_CLI_PROVIDER_ID;
}

/**
 * Preserve a typed follow-up before stopping a live Claude CLI turn.
 *
 * The queue is drained by the main-process idle transition, so the prompt is
 * only written to the PTY after the interrupt has returned Claude to its
 * input-ready state. This keeps the terminal's Enter key on the same submit
 * path as every other queued prompt.
 */
export async function interruptClaudeCliWithDraft({
  draft,
  hasAttachments,
  queueDraft,
  interrupt,
}: {
  draft: string;
  hasAttachments: boolean;
  queueDraft: (draft: string) => Promise<void> | void;
  interrupt: () => Promise<void> | void;
}): Promise<void> {
  try {
    if (draft.trim() || hasAttachments) {
      await queueDraft(draft);
    }
  } finally {
    await interrupt();
  }
}
