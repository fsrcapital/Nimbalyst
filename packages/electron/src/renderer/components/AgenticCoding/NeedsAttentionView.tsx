import React from "react";
import {
  ProviderIcon,
  resolveSessionAttention,
  type SessionAttentionReason,
  type SessionMeta,
} from "@nimbalyst/runtime";
import { MaterialSymbol } from "@nimbalyst/runtime/ui/icons/MaterialSymbol";
import { getRelativeTimeString } from "../../utils/dateFormatting";
import { SessionWorkflowPopover } from "./SessionWorkflowPopover";

const REASON_PRESENTATION: Record<
  SessionAttentionReason,
  { label: string; icon: string; className: string }
> = {
  "user-input": {
    label: "Your input",
    icon: "contact_support",
    className: "border-amber-400/30 bg-amber-400/[0.12] text-amber-400",
  },
  review: {
    label: "Review",
    icon: "rate_review",
    className: "border-blue-400/30 bg-blue-400/[0.12] text-blue-400",
  },
  "manual-testing": {
    label: "Manual testing",
    icon: "science",
    className: "border-violet-400/30 bg-violet-400/[0.12] text-violet-400",
  },
  blocked: {
    label: "Blocked",
    icon: "block",
    className: "border-red-400/30 bg-red-400/[0.12] text-red-400",
  },
  "agent-handoff": {
    label: "Another agent",
    icon: "conversion_path",
    className: "border-cyan-400/30 bg-cyan-400/[0.12] text-cyan-400",
  },
};

const REASON_PRIORITY: Record<SessionAttentionReason, number> = {
  "user-input": 0,
  blocked: 1,
  review: 2,
  "manual-testing": 3,
  "agent-handoff": 4,
};

function entryPriority(reasons: SessionAttentionReason[]): number {
  return Math.min(...reasons.map((reason) => REASON_PRIORITY[reason]));
}

export interface NeedsAttentionEntry {
  session: SessionMeta;
  reasons: SessionAttentionReason[];
}

export function getNeedsAttentionEntries(
  registry: ReadonlyMap<string, SessionMeta>,
  workspacePath: string,
  includeArchived = false
): NeedsAttentionEntry[] {
  const entries: NeedsAttentionEntry[] = [];

  for (const session of registry.values()) {
    if (session.workspaceId !== workspacePath) continue;
    if (!includeArchived && session.isArchived) continue;

    const attention = resolveSessionAttention({
      workflow: {
        myNotes: session.myNotes,
        nextAction: session.nextAction,
        waitingOn: session.waitingOn,
        attentionReasons: session.attentionReasons,
      },
      hasPendingPrompt: session.hasPendingInteractivePrompt,
    });
    if (!attention.needsAttention) continue;

    entries.push({ session, reasons: attention.reasons });
  }

  return entries.sort((left, right) => {
    const reasonOrder =
      entryPriority(left.reasons) - entryPriority(right.reasons);
    if (reasonOrder !== 0) return reasonOrder;
    return (
      (right.session.updatedAt || right.session.createdAt) -
      (left.session.updatedAt || left.session.createdAt)
    );
  });
}

export interface NeedsAttentionViewProps {
  entries: NeedsAttentionEntry[];
  activeSessionId?: string | null;
  worktreeLabels?: ReadonlyMap<string, string>;
  onSelect: (sessionId: string) => void;
}

export function NeedsAttentionView({
  entries,
  activeSessionId,
  worktreeLabels,
  onSelect,
}: NeedsAttentionViewProps) {
  if (entries.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center"
        data-testid="needs-attention-empty"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nim-bg-secondary)] text-[var(--nim-success)]">
          <MaterialSymbol icon="check_circle" size={22} />
        </div>
        <p className="m-0 text-[0.8125rem] font-medium text-[var(--nim-text)]">
          Nothing needs attention
        </p>
        <p className="mt-1 max-w-[260px] text-[0.6875rem] leading-relaxed text-[var(--nim-text-faint)]">
          Sessions waiting for your input, review, testing, a dependency, or
          another agent will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="needs-attention-view flex-1 overflow-y-auto px-2 py-2"
      data-testid="needs-attention-view"
    >
      <div className="mb-2 px-2 text-[0.6875rem] leading-relaxed text-[var(--nim-text-faint)]">
        Consolidated from live agent state and your workflow flags.
      </div>
      <div className="flex flex-col gap-1.5">
        {entries.map(({ session, reasons }) => {
          const worktreeLabel = session.worktreeId
            ? worktreeLabels?.get(session.worktreeId) ??
              `Worktree ${session.worktreeId.slice(0, 8)}`
            : null;
          const isActive = activeSessionId === session.id;

          return (
            <div
              key={session.id}
              className={`needs-attention-card group cursor-pointer rounded-md border px-3 py-2 transition-colors hover:bg-[var(--nim-bg-hover)] ${
                isActive
                  ? "border-[var(--nim-primary)] bg-[var(--nim-bg-selected)]"
                  : "border-[var(--nim-border)] bg-[var(--nim-bg-secondary)]"
              }`}
              role="button"
              tabIndex={0}
              data-session-id={session.id}
              onClick={() => onSelect(session.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(session.id);
                }
              }}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-muted)]">
                  <ProviderIcon
                    provider={session.provider || "claude"}
                    size={15}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-[var(--nim-text)]"
                      title={session.title}
                    >
                      {session.title || "Untitled Session"}
                    </span>
                    <SessionWorkflowPopover
                      sessionId={session.id}
                      myNotes={session.myNotes}
                      nextAction={session.nextAction}
                      waitingOn={session.waitingOn}
                      attentionReasons={session.attentionReasons}
                      hasPendingPrompt={session.hasPendingInteractivePrompt}
                      isRowHovering
                    />
                    <MaterialSymbol
                      icon="chevron_right"
                      size={14}
                      className="text-[var(--nim-text-faint)]"
                    />
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1">
                    {reasons.map((reason) => {
                      const presentation = REASON_PRESENTATION[reason];
                      return (
                        <span
                          key={reason}
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-medium ${presentation.className}`}
                        >
                          <MaterialSymbol icon={presentation.icon} size={10} />
                          {presentation.label}
                        </span>
                      );
                    })}
                  </div>

                  {session.waitingOn && (
                    <p
                      className="mt-1.5 mb-0 truncate text-[0.6875rem] text-[var(--nim-warning)]"
                      title={session.waitingOn}
                    >
                      Waiting on: {session.waitingOn}
                    </p>
                  )}
                  {session.nextAction && (
                    <p
                      className="mt-1 mb-0 truncate text-[0.6875rem] text-[var(--nim-text-muted)]"
                      title={session.nextAction}
                    >
                      Next: {session.nextAction}
                    </p>
                  )}

                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[0.625rem] text-[var(--nim-text-faint)]">
                    <span>
                      {getRelativeTimeString(
                        session.updatedAt || session.createdAt
                      )}
                    </span>
                    {worktreeLabel && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate" title={worktreeLabel}>
                          {worktreeLabel}
                        </span>
                      </>
                    )}
                    {!worktreeLabel && session.parentSessionId && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Workstream session</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
