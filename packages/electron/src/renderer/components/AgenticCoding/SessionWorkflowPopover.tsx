import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  MaterialSymbol,
  resolveSessionAttention,
  type SessionAttentionReason,
} from "@nimbalyst/runtime";
import { FloatingPortal, useFloatingMenu } from "../../hooks/useFloatingMenu";

const EDITABLE_ATTENTION_REASONS: ReadonlyArray<{
  value: SessionAttentionReason;
  label: string;
}> = [
  { value: "review", label: "Needs review" },
  { value: "manual-testing", label: "Needs manual testing" },
  { value: "agent-handoff", label: "Needs another agent" },
];

export interface SessionWorkflowPopoverProps {
  sessionId: string;
  myNotes?: string;
  nextAction?: string;
  waitingOn?: string;
  attentionReasons?: SessionAttentionReason[];
  hasPendingPrompt?: boolean;
  isRowHovering?: boolean;
}

function editableReasons(
  reasons: SessionAttentionReason[] | undefined
): SessionAttentionReason[] {
  return EDITABLE_ATTENTION_REASONS.map(({ value }) => value).filter((reason) =>
    reasons?.includes(reason)
  );
}

export function SessionWorkflowPopover({
  sessionId,
  myNotes,
  nextAction,
  waitingOn,
  attentionReasons,
  hasPendingPrompt = false,
  isRowHovering = false,
}: SessionWorkflowPopoverProps) {
  const menu = useFloatingMenu({ placement: "right-start" });
  const [notesDraft, setNotesDraft] = useState(myNotes ?? "");
  const [nextActionDraft, setNextActionDraft] = useState(nextAction ?? "");
  const [waitingOnDraft, setWaitingOnDraft] = useState(waitingOn ?? "");
  const [reasonDraft, setReasonDraft] = useState<SessionAttentionReason[]>(
    editableReasons(attentionReasons)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (menu.isOpen) return;
    setNotesDraft(myNotes ?? "");
    setNextActionDraft(nextAction ?? "");
    setWaitingOnDraft(waitingOn ?? "");
    setReasonDraft(editableReasons(attentionReasons));
    setSaveError(null);
  }, [attentionReasons, menu.isOpen, myNotes, nextAction, waitingOn]);

  const resolvedAttention = useMemo(
    () =>
      resolveSessionAttention({
        workflow: {
          myNotes,
          nextAction,
          waitingOn,
          attentionReasons,
        },
        hasPendingPrompt,
      }),
    [attentionReasons, hasPendingPrompt, myNotes, nextAction, waitingOn]
  );

  const hasWorkflowContent = Boolean(
    myNotes?.trim() ||
      nextAction?.trim() ||
      waitingOn?.trim() ||
      attentionReasons?.length
  );
  const showTrigger =
    isRowHovering ||
    menu.isOpen ||
    hasWorkflowContent ||
    resolvedAttention.needsAttention;

  const toggleReason = useCallback((reason: SessionAttentionReason) => {
    setReasonDraft((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason]
    );
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await window.electronAPI.invoke(
        "sessions:update-session-metadata",
        sessionId,
        {
          myNotes: notesDraft.trim(),
          nextAction: nextActionDraft.trim(),
          waitingOn: waitingOnDraft.trim(),
          attentionReasons: reasonDraft,
        }
      );
      if (result?.success === false) {
        throw new Error(result.error || "Unable to save session workflow");
      }
      menu.setIsOpen(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save session workflow"
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    menu,
    nextActionDraft,
    notesDraft,
    reasonDraft,
    sessionId,
    waitingOnDraft,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        menu.setIsOpen(false);
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleSave();
      }
    },
    [handleSave, menu]
  );

  const triggerTitle = waitingOn?.trim()
    ? `Waiting on: ${waitingOn.trim()}`
    : nextAction?.trim()
    ? `Next action: ${nextAction.trim()}`
    : "Edit notes and next action";

  return (
    <>
      <button
        ref={menu.refs.setReference}
        {...menu.getReferenceProps()}
        type="button"
        className={`session-workflow-trigger relative flex h-5 w-5 shrink-0 items-center justify-center rounded border-none bg-transparent p-0 transition-all hover:bg-[var(--nim-bg-tertiary)] focus:opacity-100 focus:outline-2 focus:outline-[var(--nim-border-focus)] ${
          resolvedAttention.needsAttention
            ? "text-[var(--nim-warning)]"
            : hasWorkflowContent
            ? "text-[var(--nim-primary)]"
            : "text-[var(--nim-text-faint)]"
        } ${showTrigger ? "opacity-80" : "pointer-events-none opacity-0"}`}
        aria-label="Edit session workflow"
        aria-expanded={menu.isOpen}
        title={triggerTitle}
        onClick={(event) => {
          event.stopPropagation();
          menu.setIsOpen(!menu.isOpen);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MaterialSymbol icon="assignment" size={14} />
        {resolvedAttention.needsAttention && (
          <span
            className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-[var(--nim-warning)]"
            aria-hidden
          />
        )}
      </button>

      {menu.isOpen && (
        <FloatingPortal>
          <div
            ref={menu.refs.setFloating}
            style={menu.floatingStyles}
            {...menu.getFloatingProps()}
            className="session-workflow-popover z-[10000] w-[340px] rounded-lg border border-[var(--nim-border)] bg-[var(--nim-bg)] p-3 text-[var(--nim-text)] shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
            role="dialog"
            aria-label="Session workflow"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="mb-3 flex items-center gap-2">
              <MaterialSymbol
                icon="assignment"
                size={16}
                className="text-[var(--nim-primary)]"
              />
              <span className="text-[0.8125rem] font-semibold">
                Session workflow
              </span>
              <span className="ml-auto text-[0.625rem] text-[var(--nim-text-faint)]">
                Ctrl+Enter to save
              </span>
            </div>

            <label className="mb-2 block text-[0.6875rem] font-medium text-[var(--nim-text-muted)]">
              Next Action
              <input
                value={nextActionDraft}
                onChange={(event) => setNextActionDraft(event.target.value)}
                placeholder="What should happen next?"
                className="mt-1 w-full rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] px-2 py-1.5 text-[0.75rem] text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)]"
              />
            </label>

            <label className="mb-2 block text-[0.6875rem] font-medium text-[var(--nim-text-muted)]">
              Waiting On
              <input
                value={waitingOnDraft}
                onChange={(event) => setWaitingOnDraft(event.target.value)}
                placeholder="A person, result, dependency, or agent"
                className="mt-1 w-full rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] px-2 py-1.5 text-[0.75rem] text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)]"
              />
            </label>

            <label className="mb-3 block text-[0.6875rem] font-medium text-[var(--nim-text-muted)]">
              My Notes
              <textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="Private supervision notes for this session"
                rows={3}
                className="mt-1 w-full resize-y rounded border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] px-2 py-1.5 text-[0.75rem] leading-relaxed text-[var(--nim-text)] outline-none focus:border-[var(--nim-primary)]"
              />
            </label>

            <fieldset className="mb-3 border-0 p-0">
              <legend className="mb-1.5 text-[0.6875rem] font-medium text-[var(--nim-text-muted)]">
                Needs Attention
              </legend>
              <div className="grid grid-cols-1 gap-1">
                {EDITABLE_ATTENTION_REASONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-[0.75rem] text-[var(--nim-text)]"
                  >
                    <input
                      type="checkbox"
                      checked={reasonDraft.includes(value)}
                      onChange={() => toggleReason(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {(hasPendingPrompt || waitingOnDraft.trim()) && (
                <p className="mt-1.5 text-[0.625rem] text-[var(--nim-warning)]">
                  {hasPendingPrompt
                    ? "This session also needs your input."
                    : "Waiting On automatically marks this session as blocked."}
                </p>
              )}
            </fieldset>

            {saveError && (
              <p
                className="mb-2 text-[0.6875rem] text-[var(--nim-error)]"
                role="alert"
              >
                {saveError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--nim-border)] bg-transparent px-2.5 py-1.5 text-[0.6875rem] text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-hover)]"
                onClick={() => menu.setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                className="rounded border-none bg-[var(--nim-primary)] px-2.5 py-1.5 text-[0.6875rem] font-medium text-white disabled:opacity-50"
                onClick={() => void handleSave()}
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
