export const SESSION_ATTENTION_REASONS = [
  "user-input",
  "review",
  "manual-testing",
  "blocked",
  "agent-handoff",
] as const;

export type SessionAttentionReason = (typeof SESSION_ATTENTION_REASONS)[number];

/**
 * Human-authored workflow fields stored inside `ai_sessions.metadata`.
 *
 * All fields are optional so sessions created by older clients remain valid.
 * Empty strings and an empty attention-reasons array are meaningful on the
 * sync wire because they clear values written by another device; readers
 * normalize those cleared values back to an unset local view.
 */
export interface SessionWorkflowMetadata {
  myNotes?: string;
  nextAction?: string;
  waitingOn?: string;
  attentionReasons?: SessionAttentionReason[];
}

export interface SessionAttentionSignals {
  workflow?: SessionWorkflowMetadata;
  /** Canonical provider/session prompt state; never persist a duplicate flag. */
  hasPendingPrompt?: boolean;
}

export interface ResolvedSessionAttention {
  needsAttention: boolean;
  reasons: SessionAttentionReason[];
}

const attentionReasonSet = new Set<string>(SESSION_ATTENTION_REASONS);

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value;
}

export function isSessionAttentionReason(
  value: unknown
): value is SessionAttentionReason {
  return typeof value === "string" && attentionReasonSet.has(value);
}

/**
 * Safely reads workflow metadata written by current or older clients.
 * Unknown/malformed fields are ignored instead of making persisted sessions
 * unloadable after an upgrade or downgrade.
 */
export function normalizeSessionWorkflowMetadata(
  value: unknown
): SessionWorkflowMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  const attentionReasons = Array.isArray(source.attentionReasons)
    ? [...new Set(source.attentionReasons.filter(isSessionAttentionReason))]
    : undefined;

  return {
    myNotes: normalizeText(source.myNotes),
    nextAction: normalizeText(source.nextAction),
    waitingOn: normalizeText(source.waitingOn),
    attentionReasons: attentionReasons?.length ? attentionReasons : undefined,
  };
}

/**
 * Consolidates explicit human workflow reasons with existing canonical state.
 * A pending interactive prompt automatically requires user input, while a
 * non-empty Waiting On value automatically identifies a blocked session.
 * Review, testing, and agent handoff remain explicit because provider status
 * and Kanban phase cannot reliably distinguish those intentions.
 */
export function resolveSessionAttention(
  signals: SessionAttentionSignals
): ResolvedSessionAttention {
  const workflow = normalizeSessionWorkflowMetadata(signals.workflow);
  const reasons = new Set<SessionAttentionReason>(
    workflow.attentionReasons ?? []
  );

  if (signals.hasPendingPrompt) reasons.add("user-input");
  if (workflow.waitingOn) reasons.add("blocked");

  return {
    needsAttention: reasons.size > 0,
    reasons: SESSION_ATTENTION_REASONS.filter((reason) => reasons.has(reason)),
  };
}
