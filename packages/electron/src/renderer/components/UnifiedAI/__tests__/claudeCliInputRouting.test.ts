// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  CLAUDE_CLI_PROVIDER_ID,
  interruptClaudeCliWithDraft,
  isClaudeCliTerminalSession,
} from '../claudeCliInputRouting';

// NIM-806 Phase 1: for the genuine `claude` CLI session, the chat input box must
// route to the terminal PTY instead of ai:sendMessage (which throws for this
// provider). These helpers encode that routing decision.
describe('claudeCliInputRouting', () => {
  describe('isClaudeCliTerminalSession', () => {
    it('is true only for the claude-code-cli provider', () => {
      expect(isClaudeCliTerminalSession(CLAUDE_CLI_PROVIDER_ID)).toBe(true);
    });

    it('is false for SDK-backed and other providers', () => {
      expect(isClaudeCliTerminalSession('claude')).toBe(false);
      expect(isClaudeCliTerminalSession('claude-code')).toBe(false);
      expect(isClaudeCliTerminalSession('openai-codex')).toBe(false);
      expect(isClaudeCliTerminalSession('openai')).toBe(false);
    });

    it('is false for null/undefined provider', () => {
      expect(isClaudeCliTerminalSession(null)).toBe(false);
      expect(isClaudeCliTerminalSession(undefined)).toBe(false);
    });
  });

  describe('interruptClaudeCliWithDraft', () => {
    it('queues a typed follow-up before interrupting the active CLI turn', async () => {
      const events: string[] = [];
      const queueDraft = vi.fn(async (draft: string) => {
        events.push(`queue:${draft}`);
      });
      const interrupt = vi.fn(async () => {
        events.push('interrupt');
      });

      await interruptClaudeCliWithDraft({
        draft: 'Continue from the partial result',
        hasAttachments: false,
        queueDraft,
        interrupt,
      });

      expect(queueDraft).toHaveBeenCalledWith('Continue from the partial result');
      expect(interrupt).toHaveBeenCalledOnce();
      expect(events).toEqual([
        'queue:Continue from the partial result',
        'interrupt',
      ]);
    });

    it('interrupts without creating a queue entry when the draft is empty', async () => {
      const queueDraft = vi.fn();
      const interrupt = vi.fn();

      await interruptClaudeCliWithDraft({
        draft: '   ',
        hasAttachments: false,
        queueDraft,
        interrupt,
      });

      expect(queueDraft).not.toHaveBeenCalled();
      expect(interrupt).toHaveBeenCalledOnce();
    });

    it('still interrupts when preserving the draft fails', async () => {
      const queueDraft = vi.fn(async () => {
        throw new Error('Queue is unavailable');
      });
      const interrupt = vi.fn();

      await expect(interruptClaudeCliWithDraft({
        draft: 'Stop now',
        hasAttachments: false,
        queueDraft,
        interrupt,
      })).rejects.toThrow('Queue is unavailable');

      expect(interrupt).toHaveBeenCalledOnce();
    });
  });
});
