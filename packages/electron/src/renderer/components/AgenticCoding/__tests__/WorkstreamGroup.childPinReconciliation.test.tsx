// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { registryMetaById } = vi.hoisted(() => ({
  registryMetaById: new Map<string, unknown>(),
}));

vi.mock('jotai', async () => {
  const actual = await vi.importActual<typeof import('jotai')>('jotai');
  return {
    ...actual,
    useAtomValue: (target: { __testValue?: unknown }) => target?.__testValue,
    useSetAtom: (target: { __testSetter?: (...args: unknown[]) => unknown }) =>
      target?.__testSetter ?? vi.fn(),
  };
});

vi.mock('@nimbalyst/runtime', () => ({
  MaterialSymbol: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-icon={icon} className={className} />
  ),
  ProviderIcon: ({ provider }: { provider: string }) => <span data-provider={provider} />,
  copyToClipboard: vi.fn(),
}));

vi.mock('../../../store', () => {
  const value = (testValue: unknown) => ({ __testValue: testValue });
  const setter = (testSetter: (...args: unknown[]) => unknown = vi.fn()) => ({
    __testSetter: testSetter,
  });
  return {
    sessionProcessingAtom: () => value(false),
    sessionActiveSubagentCountAtom: () => value(0),
    sessionUnreadAtom: () => value(false),
    sessionPendingPromptAtom: () => value(false),
    sessionHasPendingInteractivePromptAtom: () => value(false),
    sessionListTitleAtom: () => value(null),
    sessionListMetaAtom: (sessionId: string) => value(registryMetaById.get(sessionId)),
    groupSessionStatusAtom: () => value({
      hasPendingInteractivePrompt: false,
      hasProcessing: false,
      hasPendingPrompt: false,
      hasUnread: false,
    }),
    reparentSessionAtom: setter(async () => true),
    refreshSessionListAtom: setter(async () => undefined),
    sessionShareAtom: () => value(null),
    removeSessionShareAtom: setter(),
    shareKeysAtom: value(new Map()),
    buildShareUrl: vi.fn(),
  };
});

vi.mock('../../../services/ErrorNotificationService', () => ({
  errorNotificationService: { showError: vi.fn() },
}));

vi.mock('../../../dialogs', () => ({
  dialogRef: { current: null },
  DIALOG_IDS: { SHARE: 'share' },
}));

vi.mock('../SessionRelativeTime', () => ({
  SessionRelativeTime: () => <span data-testid="relative-time" />,
}));

vi.mock('../SessionWorkflowPopover', () => ({
  SessionWorkflowPopover: ({
    sessionId,
    myNotes,
    nextAction,
    waitingOn,
    cacheWarmEnabled,
  }: {
    sessionId: string;
    myNotes?: string;
    nextAction?: string;
    waitingOn?: string;
    cacheWarmEnabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label="Edit session workflow"
      data-session-id={sessionId}
      data-my-notes={myNotes}
      data-next-action={nextAction}
      data-waiting-on={waitingOn}
      data-cache-warm-enabled={String(cacheWarmEnabled === true)}
    />
  ),
}));

vi.mock('../SessionContextMenu', () => ({
  SessionContextMenu: ({
    isPinned,
    onPinToggle,
  }: {
    isPinned: boolean;
    onPinToggle?: (isPinned: boolean) => void;
  }) => (
    <button onClick={() => onPinToggle?.(!isPinned)}>
      {isPinned ? 'Unpin' : 'Pin'}
    </button>
  ),
}));

import type { SessionMeta } from '../../../store';
import { WorkstreamGroup } from '../WorkstreamGroup';
import {
  mapWorkstreamChildListEntry,
  reconcileSessionPinToggle,
  workstreamChildrenNeedRefresh,
} from '../workstreamChildPinReconciliation';

const workspacePath = 'D:/workspace';
const parentId = 'parent-session';
const targetId = 'target-child';
const siblingId = 'sibling-child';

function session(overrides: Partial<SessionMeta> & Pick<SessionMeta, 'id' | 'title'>): SessionMeta {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    createdAt: 100,
    updatedAt: 100,
    provider: 'claude',
    sessionType: 'session',
    messageCount: 0,
    workspaceId: workspacePath,
    isArchived: false,
    isPinned: false,
    worktreeId: null,
    parentSessionId: parentId,
    childCount: 0,
    uncommittedCount: 0,
    ...rest,
  };
}

function childRows() {
  return screen.getAllByTestId('workstream-child-item');
}

function childTitles() {
  return childRows().map(row => within(row).getByText(/Target|Sibling/).textContent);
}

function renderExpandedWorkstream(
  children: SessionMeta[],
  onSessionPinToggle: (sessionId: string, isPinned: boolean) => void,
  onWorkstreamPinToggle = vi.fn(),
) {
  return render(
    <WorkstreamGroup
      type="workstream"
      id={parentId}
      title="Parent"
      isExpanded
      isActive={false}
      onToggle={vi.fn()}
      onSelect={vi.fn()}
      sessions={children}
      activeSessionId={null}
      onSessionSelect={vi.fn()}
      onSessionPinToggle={onSessionPinToggle}
      onWorkstreamPinToggle={onWorkstreamPinToggle}
      isPinned={false}
      childCount={children.length}
      projectPath={workspacePath}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  registryMetaById.clear();
});

describe('expanded workstream child pin reconciliation', () => {
  it('hydrates persisted cache warming for nested session rows', () => {
    const child = mapWorkstreamChildListEntry({
      id: targetId,
      title: 'Target',
      provider: 'claude-code',
      createdAt: 100,
      updatedAt: 200,
      parentSessionId: parentId,
      cacheWarmEnabled: true,
      cacheWarmNextAt: 1234,
      cacheWarmLastAt: 1000,
      cacheWarmLastStatus: 'success',
    }, workspacePath);

    expect(child).toMatchObject({
      id: targetId,
      parentSessionId: parentId,
      cacheWarmEnabled: true,
      cacheWarmNextAt: 1234,
      cacheWarmLastAt: 1000,
      cacheWarmLastStatus: 'success',
    });
  });

  it('offers notes and workflow editing on nested session rows', () => {
    renderExpandedWorkstream([
      session({
        id: targetId,
        title: 'Target',
        myNotes: 'Review the final diff',
        nextAction: 'Run the smoke test',
        waitingOn: 'Test environment',
      }),
    ], vi.fn());

    const workflowButton = within(childRows()[0]).getByRole('button', {
      name: 'Edit session workflow',
    });
    expect(workflowButton.dataset.sessionId).toBe(targetId);
    expect(workflowButton.dataset.myNotes).toBe('Review the final diff');
    expect(workflowButton.dataset.nextAction).toBe('Run the smoke test');
    expect(workflowButton.dataset.waitingOn).toBe('Test environment');
  });

  it('uses current registry metadata after nested cache warming is disabled', () => {
    const cached = session({
      id: targetId,
      title: 'Target',
      cacheWarmEnabled: true,
      cacheWarmNextAt: 1234,
    });
    registryMetaById.set(targetId, {
      ...cached,
      cacheWarmEnabled: false,
      cacheWarmNextAt: undefined,
    });

    renderExpandedWorkstream([cached], vi.fn());

    const workflowButton = within(childRows()[0]).getByRole('button', {
      name: 'Edit session workflow',
    });
    expect(workflowButton.dataset.cacheWarmEnabled).toBe('false');
  });

  it('reconciles true -> false without refresh or removal', async () => {
    const target = session({
      id: targetId,
      title: 'Target',
      isPinned: true,
      updatedAt: 100,
    });
    const sibling = session({
      id: siblingId,
      title: 'Sibling',
      updatedAt: 200,
    });
    const parent = session({
      id: parentId,
      title: 'Parent',
      sessionType: 'workstream',
      parentSessionId: null,
      childCount: 2,
      isPinned: false,
    });
    let sessions = [parent];
    let cache = new Map([[parentId, [target, sibling]]]);
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const updateSessionStore = vi.fn();
    const parentPinToggle = vi.fn();

    const onSessionPinToggle = (sessionId: string, isPinned: boolean) => {
      void reconcileSessionPinToggle({
        sessionId,
        isPinned,
        invoke,
        updateSessionStore,
        setSessions: updater => { sessions = updater(sessions); },
        setWorkstreamChildrenCache: updater => { cache = updater(cache); },
      });
    };

    const view = renderExpandedWorkstream(
      cache.get(parentId) ?? [],
      onSessionPinToggle,
      parentPinToggle,
    );

    expect(childTitles()).toEqual(['Target', 'Sibling']);
    expect(childRows()[0].querySelector('[data-icon="push_pin"]')).not.toBeNull();

    fireEvent.contextMenu(childRows()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Unpin' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('sessions:update-pinned', targetId, false);
    });
    view.rerender(
      <WorkstreamGroup
        type="workstream"
        id={parentId}
        title="Parent"
        isExpanded
        isActive={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        sessions={cache.get(parentId) ?? []}
        activeSessionId={null}
        onSessionSelect={vi.fn()}
        onSessionPinToggle={onSessionPinToggle}
        onWorkstreamPinToggle={parentPinToggle}
        isPinned={sessions[0].isPinned}
        childCount={2}
        projectPath={workspacePath}
      />,
    );

    expect(childTitles()).toEqual(['Sibling', 'Target']);
    expect(childRows()[1].querySelector('[data-icon="push_pin"]')).toBeNull();
    fireEvent.contextMenu(childRows()[1]);
    screen.getByRole('button', { name: 'Pin' });
    expect(updateSessionStore).toHaveBeenCalledWith({
      sessionId: targetId,
      updates: { isPinned: false },
    });
    expect(sessions[0].isPinned).toBe(false);
    expect(parentPinToggle).not.toHaveBeenCalled();
  });

  it('reconciles false -> true without refresh or removal', async () => {
    const target = session({
      id: targetId,
      title: 'Target',
      updatedAt: 100,
    });
    const sibling = session({
      id: siblingId,
      title: 'Sibling',
      updatedAt: 200,
    });
    let cache = new Map([[parentId, [target, sibling]]]);
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const updateSessionStore = vi.fn();

    const onSessionPinToggle = (sessionId: string, isPinned: boolean) => {
      void reconcileSessionPinToggle({
        sessionId,
        isPinned,
        invoke,
        updateSessionStore,
        setSessions: vi.fn(),
        setWorkstreamChildrenCache: updater => { cache = updater(cache); },
      });
    };

    const view = renderExpandedWorkstream(cache.get(parentId) ?? [], onSessionPinToggle);

    expect(childTitles()).toEqual(['Sibling', 'Target']);
    fireEvent.contextMenu(childRows()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('sessions:update-pinned', targetId, true);
    });
    view.rerender(
      <WorkstreamGroup
        type="workstream"
        id={parentId}
        title="Parent"
        isExpanded
        isActive={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        sessions={cache.get(parentId) ?? []}
        activeSessionId={null}
        onSessionSelect={vi.fn()}
        onSessionPinToggle={onSessionPinToggle}
        isPinned={false}
        childCount={2}
        projectPath={workspacePath}
      />,
    );

    expect(childTitles()).toEqual(['Target', 'Sibling']);
    expect(childRows()[0].querySelector('[data-icon="push_pin"]')).not.toBeNull();
    fireEvent.contextMenu(childRows()[0]);
    screen.getByRole('button', { name: 'Unpin' });
  });

  it('does not require a children refetch for registry-only field updates', () => {
    const cachedChildren = [
      session({ id: targetId, title: 'Target', isPinned: false }),
      session({ id: siblingId, title: 'Sibling', isPinned: false }),
    ];
    const registryAfterPin = new Map<string, SessionMeta>([
      [targetId, { ...cachedChildren[0], isPinned: true }],
      [siblingId, cachedChildren[1]],
    ]);

    expect(workstreamChildrenNeedRefresh(cachedChildren, 2, registryAfterPin)).toBe(false);
  });
});

describe('worktree session drop', () => {
  it('attaches a dragged standalone session to the target worktree', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const previousElectronAPI = window.electronAPI;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { ...previousElectronAPI, invoke },
    });

    try {
      render(
        <WorkstreamGroup
          type="worktree"
          id="worktree-1"
          title="Feature branch"
          isExpanded
          isActive={false}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
          sessions={[]}
          activeSessionId={null}
          onSessionSelect={vi.fn()}
          projectPath={workspacePath}
          worktree={{
            id: 'worktree-1',
            name: 'feature-branch',
            path: 'D:/workspace/.worktrees/feature-branch',
            branch: 'feature-branch',
          }}
        />,
      );

      const header = screen.getByTestId('worktree-group').querySelector('.workstream-group-header');
      expect(header).not.toBeNull();
      const payload = JSON.stringify({
        sessionId: 'standalone-session',
        parentId: null,
        workspacePath,
        isWorktreeSession: false,
      });
      const dataTransfer = {
        types: ['application/x-nimbalyst-session'],
        getData: vi.fn(() => payload),
        dropEffect: 'none',
      };

      fireEvent.dragOver(header!, { dataTransfer });
      fireEvent.drop(header!, { dataTransfer });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('sessions:attach-to-worktree', {
          sessionId: 'standalone-session',
          worktreeId: 'worktree-1',
          workspacePath,
        });
      });
    } finally {
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: previousElectronAPI,
      });
    }
  });
});
