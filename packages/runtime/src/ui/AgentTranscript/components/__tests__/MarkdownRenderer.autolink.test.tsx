import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as rtl from '@testing-library/react';
import { MarkdownRenderer } from '../MarkdownRenderer';

const { render, screen, fireEvent } = rtl;

describe('MarkdownRenderer file-path autolinking', () => {
  it('autolinks a bare workspace-relative path and opens it on click', () => {
    const onOpenFile = vi.fn();
    render(
      <MarkdownRenderer
        content="Check packages/electron/src/foo.ts now"
        onOpenFile={onOpenFile}
      />,
    );

    const link = screen.getByText('packages/electron/src/foo.ts');
    expect(link.tagName).toBe('A');

    fireEvent.click(link);
    expect(onOpenFile).toHaveBeenCalledWith('packages/electron/src/foo.ts', undefined);
  });

  it('strips the :line:col suffix from the path and reports it as a location', () => {
    const onOpenFile = vi.fn();
    render(
      <MarkdownRenderer content="open src/a/foo.ts:42:7 here" onOpenFile={onOpenFile} />,
    );

    fireEvent.click(screen.getByText('src/a/foo.ts:42:7'));
    expect(onOpenFile).toHaveBeenCalledWith('src/a/foo.ts', { line: 42, column: 7 });
  });

  it('offers default-app and copy-path actions from a file link context menu', () => {
    const onOpenFileInDefaultApp = vi.fn();
    const onCopyFilePath = vi.fn();
    render(
      <MarkdownRenderer
        content="[the document](/workspace/docs/design.md:42)"
        onOpenFile={vi.fn()}
        onOpenFileInDefaultApp={onOpenFileInDefaultApp}
        onCopyFilePath={onCopyFilePath}
      />,
    );

    fireEvent.contextMenu(screen.getByText('the document'), { clientX: 25, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Default App' }));
    expect(onOpenFileInDefaultApp).toHaveBeenCalledWith('/workspace/docs/design.md');

    fireEvent.contextMenu(screen.getByText('the document'), { clientX: 25, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Path' }));
    expect(onCopyFilePath).toHaveBeenCalledWith('/workspace/docs/design.md');
  });

  it('does not autolink when no onOpenFile handler is provided', () => {
    const { container } = render(
      <MarkdownRenderer content="Check packages/electron/src/foo.ts now" />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('autolinks a path inside inline code and opens it on click', () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownRenderer content="run `packages/a/foo.ts`" onOpenFile={onOpenFile} />,
    );
    const link = screen.getByText('packages/a/foo.ts');
    expect(link.tagName).toBe('A');
    // Still rendered within inline code styling.
    expect(link.closest('code')).not.toBeNull();
    fireEvent.click(link);
    expect(onOpenFile).toHaveBeenCalledWith('packages/a/foo.ts', undefined);
  });

  it('does NOT autolink paths inside fenced code blocks', () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownRenderer
        content={'```\nedit packages/a/foo.ts here\n```'}
        onOpenFile={onOpenFile}
      />,
    );
    expect(container.querySelector('a')).toBeNull();
  });
});
