// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("../../../hooks/useFloatingMenu", async () => {
  const ReactModule = await import("react");
  return {
    FloatingPortal: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useFloatingMenu: () => {
      const [isOpen, setIsOpen] = ReactModule.useState(false);
      return {
        isOpen,
        setIsOpen,
        refs: {
          setReference: () => {},
          setFloating: () => {},
        },
        floatingStyles: {},
        getReferenceProps: () => ({}),
        getFloatingProps: () => ({}),
      };
    },
  };
});

vi.mock("@nimbalyst/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nimbalyst/runtime")>()),
  MaterialSymbol: ({ icon }: { icon: string }) => <span>{icon}</span>,
}));

import { SessionWorkflowPopover } from "../SessionWorkflowPopover";

beforeEach(() => {
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      invoke: vi.fn().mockResolvedValue({ success: true }),
    },
  });
});

afterEach(() => cleanup());

describe("SessionWorkflowPopover", () => {
  it("does not bubble pointer or keyboard activation to the session row", () => {
    const rowClick = vi.fn();
    const rowKeyDown = vi.fn();
    render(
      <div onClick={rowClick} onKeyDown={rowKeyDown}>
        <SessionWorkflowPopover sessionId="session-0" isRowHovering />
      </div>
    );

    const trigger = screen.getByRole("button", {
      name: "Edit session workflow",
    });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);

    expect(rowKeyDown).not.toHaveBeenCalled();
    expect(rowClick).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Session workflow" })
    ).toBeTruthy();
  });

  it("saves trimmed workflow fields without loading or interrupting the session", async () => {
    render(
      <SessionWorkflowPopover
        sessionId="session-1"
        nextAction="Review current diff"
        isRowHovering
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit session workflow" })
    );
    fireEvent.change(screen.getByLabelText("Next Action"), {
      target: { value: "  Run desktop tests  " },
    });
    fireEvent.change(screen.getByLabelText("Waiting On"), {
      target: { value: "  Codex review  " },
    });
    fireEvent.change(screen.getByLabelText("My Notes"), {
      target: { value: "  Check the compact layout  " },
    });
    fireEvent.click(screen.getByLabelText("Needs review"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        "sessions:update-session-metadata",
        "session-1",
        {
          myNotes: "Check the compact layout",
          nextAction: "Run desktop tests",
          waitingOn: "Codex review",
          attentionReasons: ["review"],
        }
      );
    });
    expect(
      screen.queryByRole("dialog", { name: "Session workflow" })
    ).toBeNull();
  });

  it("sends explicit empty values so another device can observe field clears", async () => {
    render(
      <SessionWorkflowPopover
        sessionId="session-2"
        myNotes="Old note"
        nextAction="Old action"
        waitingOn="Old dependency"
        attentionReasons={["manual-testing"]}
        isRowHovering
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit session workflow" })
    );
    fireEvent.change(screen.getByLabelText("Next Action"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Waiting On"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("My Notes"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByLabelText("Needs manual testing"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        "sessions:update-session-metadata",
        "session-2",
        {
          myNotes: "",
          nextAction: "",
          waitingOn: "",
          attentionReasons: [],
        }
      );
    });
  });

  it("enables prompt-cache warming from the session workflow form", async () => {
    render(<SessionWorkflowPopover sessionId="session-warm" isRowHovering />);

    fireEvent.click(screen.getByRole("button", { name: "Edit session workflow" }));
    fireEvent.click(screen.getByLabelText("Keep warm until unchecked"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        "sessions:set-cache-warm",
        "session-warm",
        true
      );
    });
  });

  it("keeps the editor open and reports a persistence failure", async () => {
    vi.mocked(window.electronAPI.invoke).mockResolvedValueOnce({
      success: false,
      error: "Database unavailable",
    });
    render(<SessionWorkflowPopover sessionId="session-3" isRowHovering />);

    fireEvent.click(
      screen.getByRole("button", { name: "Edit session workflow" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Database unavailable"
    );
    expect(
      screen.getByRole("dialog", { name: "Session workflow" })
    ).toBeTruthy();
  });
});
