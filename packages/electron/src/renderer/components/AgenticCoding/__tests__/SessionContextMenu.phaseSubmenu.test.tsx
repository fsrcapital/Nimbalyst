// @vitest-environment jsdom
import React from 'react';
import { atom, type PrimitiveAtom } from 'jotai';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const shareAtoms = new Map<string, PrimitiveAtom<null>>();

vi.mock('@nimbalyst/runtime', () => ({
  MaterialSymbol: ({ icon }: { icon: string }) => <span>{icon}</span>,
  copyToClipboard: vi.fn(),
}));

vi.mock('../../../store', () => ({
  sessionShareAtom: (sessionId: string) => {
    if (!shareAtoms.has(sessionId)) shareAtoms.set(sessionId, atom(null));
    return shareAtoms.get(sessionId)!;
  },
  shareKeysAtom: atom(new Map()),
  removeSessionShareAtom: atom(null, () => {}),
  buildShareUrl: vi.fn(),
}));

vi.mock('../../../store/atoms/sessionKanban', () => ({
  setSessionPhaseAtom: atom(null, () => {}),
  SESSION_PHASE_COLUMNS: [
    { value: 'backlog', label: 'Backlog', color: '#888' },
    { value: 'planning', label: 'Planning', color: '#999' },
  ],
}));

vi.mock('../../../services/ErrorNotificationService', () => ({
  errorNotificationService: { showInfo: vi.fn(), showError: vi.fn() },
}));

vi.mock('../../../dialogs', () => ({
  dialogRef: { current: null },
  DIALOG_IDS: { SHARE: 'share' },
}));

vi.mock('../../../hooks/useFloatingMenu', () => ({
  FloatingPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  virtualElement: vi.fn(() => ({ getBoundingClientRect: () => new DOMRect() })),
  useFloatingMenu: () => ({
    refs: { setFloating: () => {} },
    floatingStyles: {},
    getFloatingProps: () => ({}),
  }),
}));

import { SessionContextMenu } from '../SessionContextMenu';

afterEach(() => cleanup());

describe('SessionContextMenu phase submenu', () => {
  it('stays open while the pointer crosses from Set Phase into its submenu', () => {
    const onClose = vi.fn();
    render(
      <SessionContextMenu
        sessionId="session-1"
        title="Session"
        position={{ x: 20, y: 20 }}
        onClose={onClose}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Set Phase/i });
    const triggerRegion = trigger.parentElement!;
    fireEvent.mouseEnter(triggerRegion);

    const submenuItem = screen.getByRole('button', { name: 'Backlog' });
    const submenu = submenuItem.parentElement!;
    // The submenu is offset from the trigger, so the pointer briefly crosses
    // the parent menu before entering the submenu itself.
    fireEvent.mouseLeave(triggerRegion, { relatedTarget: triggerRegion.parentElement });
    fireEvent.mouseEnter(submenu, { relatedTarget: triggerRegion });

    expect(screen.getByRole('button', { name: 'Backlog' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
