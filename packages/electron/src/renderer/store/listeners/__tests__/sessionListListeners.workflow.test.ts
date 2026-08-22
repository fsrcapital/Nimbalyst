import { describe, expect, it } from "vitest";
import type { SessionMeta } from "@nimbalyst/runtime";
import { applySessionMetadataUpdates } from "../sessionListListeners";

const baseMeta: SessionMeta = {
  id: "session-1",
  title: "Session",
  provider: "claude-code",
  sessionType: "session",
  workspaceId: "C:/Code/project",
  worktreeId: null,
  parentSessionId: null,
  childCount: 0,
  uncommittedCount: 0,
  createdAt: 1,
  updatedAt: 1,
  messageCount: 0,
  isArchived: false,
  isPinned: false,
};

describe("applySessionMetadataUpdates workflow fields", () => {
  it("patches human workflow fields and derives consolidated attention", () => {
    const updated = applySessionMetadataUpdates(baseMeta, {
      myNotes: "Review the architecture decision",
      nextAction: "Run the renderer tests",
      waitingOn: "Design approval",
      attentionReasons: ["review", "review", "unknown"],
    });

    expect(updated).toMatchObject({
      myNotes: "Review the architecture decision",
      nextAction: "Run the renderer tests",
      waitingOn: "Design approval",
      attentionReasons: ["review"],
      needsAttention: true,
    });
  });

  it("normalizes explicit clears from IPC back to safe empty UI defaults", () => {
    const updated = applySessionMetadataUpdates(
      {
        ...baseMeta,
        myNotes: "Old note",
        nextAction: "Old action",
        waitingOn: "Old dependency",
        attentionReasons: ["manual-testing"],
        needsAttention: true,
      },
      {
        myNotes: "",
        nextAction: "",
        waitingOn: "",
        attentionReasons: [],
      }
    );

    expect(updated.myNotes).toBeUndefined();
    expect(updated.nextAction).toBeUndefined();
    expect(updated.waitingOn).toBeUndefined();
    expect(updated.attentionReasons).toBeUndefined();
    expect(updated.needsAttention).toBe(false);
  });

  it("derives user-input attention from canonical prompt updates", () => {
    const updated = applySessionMetadataUpdates(baseMeta, {
      hasPendingPrompt: true,
    });

    expect(updated.hasPendingInteractivePrompt).toBe(true);
    expect(updated.needsAttention).toBe(true);
  });
});
