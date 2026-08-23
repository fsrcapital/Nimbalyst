// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SessionMeta } from "@nimbalyst/runtime";

vi.mock("@nimbalyst/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nimbalyst/runtime")>()),
  ProviderIcon: ({ provider }: { provider: string }) => <span>{provider}</span>,
}));
vi.mock("@nimbalyst/runtime/ui/icons/MaterialSymbol", () => ({
  MaterialSymbol: ({ icon }: { icon: string }) => <span>{icon}</span>,
}));
vi.mock("../SessionWorkflowPopover", () => ({
  SessionWorkflowPopover: () => <button type="button">Edit workflow</button>,
}));

import {
  getNeedsAttentionEntries,
  NeedsAttentionView,
} from "../NeedsAttentionView";

function session(
  overrides: Partial<SessionMeta> & Pick<SessionMeta, "id">
): SessionMeta {
  const { id, ...rest } = overrides;
  return {
    id,
    title: id,
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
    ...rest,
  };
}

afterEach(() => cleanup());

describe("getNeedsAttentionEntries", () => {
  it("uses canonical prompt and workflow state, including child and worktree sessions", () => {
    const sessions = [
      session({
        id: "review",
        attentionReasons: ["review"],
        updatedAt: 10,
      }),
      session({
        id: "blocked-child",
        parentSessionId: "workstream",
        waitingOn: "API credentials",
        updatedAt: 20,
      }),
      session({
        id: "input-worktree",
        worktreeId: "wt-1",
        hasPendingInteractivePrompt: true,
        updatedAt: 30,
      }),
      session({
        id: "stale-derived-flag",
        needsAttention: true,
      }),
      session({
        id: "archived",
        attentionReasons: ["manual-testing"],
        isArchived: true,
      }),
      session({
        id: "another-workspace",
        workspaceId: "C:/Code/other",
        attentionReasons: ["agent-handoff"],
      }),
    ];
    const registry = new Map(sessions.map((item) => [item.id, item]));

    const entries = getNeedsAttentionEntries(registry, "C:/Code/project");

    expect(entries.map((entry) => entry.session.id)).toEqual([
      "input-worktree",
      "blocked-child",
      "review",
    ]);
    expect(entries.map((entry) => entry.reasons)).toEqual([
      ["user-input"],
      ["blocked"],
      ["review"],
    ]);
  });
});

describe("NeedsAttentionView", () => {
  it("shows reasons and workflow context and opens the selected worktree session", () => {
    const onSelect = vi.fn();
    const item = session({
      id: "session-1",
      title: "Implement the workflow dashboard",
      worktreeId: "wt-1",
      waitingOn: "Product review",
      nextAction: "Run manual smoke test",
      attentionReasons: ["manual-testing"],
    });
    const entries = getNeedsAttentionEntries(
      new Map([[item.id, item]]),
      item.workspaceId
    );

    render(
      <NeedsAttentionView
        entries={entries}
        worktreeLabels={new Map([["wt-1", "workflow-dashboard"]])}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Manual testing")).toBeTruthy();
    expect(screen.getByText("Waiting on: Product review")).toBeTruthy();
    expect(screen.getByText("Next: Run manual smoke test")).toBeTruthy();
    expect(screen.getByText("workflow-dashboard")).toBeTruthy();

    fireEvent.click(screen.getByText("Implement the workflow dashboard"));
    expect(onSelect).toHaveBeenCalledWith("session-1");
  });

  it("explains the live empty state", () => {
    render(<NeedsAttentionView entries={[]} onSelect={() => {}} />);

    expect(screen.getByText("Nothing needs attention")).toBeTruthy();
    expect(screen.getByTestId("needs-attention-empty").textContent).toContain(
      "waiting for your input"
    );
  });
});
