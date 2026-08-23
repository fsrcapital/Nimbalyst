// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  normalizeSessionWorkflowMetadata,
  resolveSessionAttention,
} from "../sessionWorkflow";

describe("normalizeSessionWorkflowMetadata", () => {
  it("defaults missing and malformed persisted metadata safely", () => {
    expect(normalizeSessionWorkflowMetadata(undefined)).toEqual({});
    expect(normalizeSessionWorkflowMetadata("legacy-json-text")).toEqual({});
    expect(normalizeSessionWorkflowMetadata([])).toEqual({});
  });

  it("keeps human text and filters unknown or duplicate attention reasons", () => {
    expect(
      normalizeSessionWorkflowMetadata({
        myNotes: "Check the migration carefully",
        nextAction: "Ask Codex to review",
        waitingOn: "CI",
        attentionReasons: ["review", "unknown", "review", "agent-handoff"],
      })
    ).toEqual({
      myNotes: "Check the migration carefully",
      nextAction: "Ask Codex to review",
      waitingOn: "CI",
      attentionReasons: ["review", "agent-handoff"],
    });
  });

  it("normalizes cleared values to an unset local view", () => {
    expect(
      normalizeSessionWorkflowMetadata({
        myNotes: "",
        nextAction: "   ",
        waitingOn: "",
        attentionReasons: [],
      })
    ).toEqual({});
  });
});

describe("resolveSessionAttention", () => {
  it("reuses pending-prompt state as the automatic user-input signal", () => {
    expect(resolveSessionAttention({ hasPendingPrompt: true })).toEqual({
      needsAttention: true,
      reasons: ["user-input"],
    });
  });

  it("derives blocked from Waiting On and preserves explicit workflow reasons", () => {
    expect(
      resolveSessionAttention({
        workflow: {
          waitingOn: "Staging credentials",
          attentionReasons: ["manual-testing", "agent-handoff"],
        },
      })
    ).toEqual({
      needsAttention: true,
      reasons: ["manual-testing", "blocked", "agent-handoff"],
    });
  });

  it("does not infer review or testing from notes and next action text", () => {
    expect(
      resolveSessionAttention({
        workflow: {
          myNotes: "Implementation is finished",
          nextAction: "Review when convenient",
        },
      })
    ).toEqual({ needsAttention: false, reasons: [] });
  });
});
