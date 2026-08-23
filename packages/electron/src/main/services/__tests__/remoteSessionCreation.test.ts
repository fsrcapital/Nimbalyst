// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveRemoteSessionCreation } from '../remoteSessionCreation';

const options = {
  providers: [{
    id: 'openai-codex' as const,
    label: 'OpenAI Codex',
    models: [{ id: 'openai-codex:gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
  }],
};

describe('resolveRemoteSessionCreation', () => {
  it('validates the desktop model catalog and derives a compact title', () => {
    expect(resolveRemoteSessionCreation(options, {
      provider: 'openai-codex',
      model: 'openai-codex:gpt-5.6-sol',
      prompt: 'Build the remote session flow\nwith tests',
      useWorktree: true,
    })).toEqual({
      provider: 'openai-codex',
      model: 'openai-codex:gpt-5.6-sol',
      prompt: 'Build the remote session flow\nwith tests',
      title: 'Build the remote session flow',
      useWorktree: true,
    });
  });

  it('rejects a model that is not enabled for the selected provider', () => {
    expect(() => resolveRemoteSessionCreation(options, {
      provider: 'openai-codex',
      model: 'openai-codex:unknown',
      prompt: 'Try it',
      useWorktree: false,
    })).toThrow(/not available/);
  });
});
