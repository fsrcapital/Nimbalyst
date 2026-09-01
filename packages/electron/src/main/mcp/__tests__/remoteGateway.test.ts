// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createRemoteGatewayRouter,
  deriveRemoteGatewayToken,
  type RemoteGatewayDependencies,
} from '../remoteGateway';
import { serializeRemotePendingPrompt, serializeRemoteTranscript } from '../remoteTranscript';
import { resolveRemoteGitLocation } from '../remoteSession';

const allowedOrigin = 'https://nimbalyst-command-center.fsrcapital.chatgpt.site';
const seed = 'dGVzdC1lbmNyeXB0aW9uLWtleS1zZWVkLWZvci10ZXN0cw==';

function dependencies(): RemoteGatewayDependencies {
  return {
    getToken: () => deriveRemoteGatewayToken(seed),
    listWorkspaces: vi.fn(async () => [{ path: 'C:\\Code\\Nimbalyst', name: 'Nimbalyst' }]),
    listSessions: vi.fn(async () => [{ id: 'session-1', title: 'Gateway', workspaceId: 'C:\\Code\\Nimbalyst' }]),
    listSessionCreationOptions: vi.fn(async () => ({
      providers: [{
        id: 'openai-codex',
        label: 'OpenAI Codex',
        models: [{ id: 'openai-codex:gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
      }],
    })),
    createSession: vi.fn(async () => ({ sessionId: 'session-new', title: 'Build the feature' })),
    getSessionResult: vi.fn(async () => ({ sessionId: 'session-1', status: 'idle' })),
    getTranscript: vi.fn(async () => ({ messages: [], cursor: 0, truncated: false })),
    sendPrompt: vi.fn(async () => ({ sessionId: 'session-1', processingTriggered: true })),
    cancelSession: vi.fn(async () => ({ sessionId: 'session-1', success: true })),
    respondToPrompt: vi.fn(async () => ({ sessionId: 'session-1', success: true })),
    updateWorkflow: vi.fn(async () => ({ sessionId: 'session-1', success: true })),
    getUsage: vi.fn(async () => ({
      claude: { fiveHour: { utilization: 20, resetsAt: null } },
      codex: { limits: [] },
    })),
    getWebPushPublicKey: vi.fn(() => 'vapid-public-key'),
    subscribeWebPush: vi.fn(() => undefined),
    unsubscribeWebPush: vi.fn(() => undefined),
  };
}

describe('remote gateway', () => {
  it('derives a stable, domain-separated bearer token from the pairing seed', () => {
    expect(deriveRemoteGatewayToken(seed)).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveRemoteGatewayToken(seed)).toBe(deriveRemoteGatewayToken(seed));
    expect(deriveRemoteGatewayToken('AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=')).not.toBe(deriveRemoteGatewayToken(seed));
  });

  it('rejects foreign browser origins and invalid bearer tokens', async () => {
    const router = createRemoteGatewayRouter(dependencies());
    const token = deriveRemoteGatewayToken(seed);

    await expect(router({ method: 'GET', pathname: '/remote/v1/workspaces', origin: 'https://evil.example', token })).resolves.toMatchObject({ status: 403 });
    await expect(router({ method: 'GET', pathname: '/remote/v1/workspaces', origin: allowedOrigin, token: 'wrong' })).resolves.toMatchObject({ status: 401 });
  });

  it('limits every session operation to a mobile-enabled workspace', async () => {
    const deps = dependencies();
    const router = createRemoteGatewayRouter(deps);
    const request = {
      method: 'POST',
      pathname: '/remote/v1/sessions/list',
      origin: allowedOrigin,
      token: deriveRemoteGatewayToken(seed),
      body: { workspacePath: 'C:\\Code\\Other' },
    } as const;

    await expect(router(request)).resolves.toMatchObject({ status: 403 });
    expect(deps.listSessions).not.toHaveBeenCalled();
  });

  it('lists sessions and forwards prompts through the narrow gateway surface', async () => {
    const deps = dependencies();
    const router = createRemoteGatewayRouter(deps);
    const token = deriveRemoteGatewayToken(seed);

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/sessions/list',
      origin: allowedOrigin,
      token,
      body: { workspacePath: 'C:\\Code\\Nimbalyst' },
    })).resolves.toEqual({ status: 200, body: { sessions: [{ id: 'session-1', title: 'Gateway', workspaceId: 'C:\\Code\\Nimbalyst' }] } });

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/sessions/session-1/prompts',
      origin: allowedOrigin,
      token,
      body: { workspacePath: 'C:\\Code\\Nimbalyst', prompt: 'Continue with the review.' },
    })).resolves.toMatchObject({ status: 200 });
    expect(deps.sendPrompt).toHaveBeenCalledWith('C:\\Code\\Nimbalyst', 'session-1', 'Continue with the review.');

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/sessions/session-1/transcript',
      origin: allowedOrigin,
      token,
      body: { workspacePath: 'C:\\Code\\Nimbalyst' },
    })).resolves.toMatchObject({ status: 200, body: { messages: [], cursor: 0 } });
    expect(deps.getTranscript).toHaveBeenCalledWith('C:\\Code\\Nimbalyst', 'session-1');

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/sessions/session-1/cancel',
      origin: allowedOrigin,
      token,
      body: { workspacePath: 'C:\\Code\\Nimbalyst' },
    })).resolves.toMatchObject({ status: 200, body: { success: true } });
    expect(deps.cancelSession).toHaveBeenCalledWith('C:\\Code\\Nimbalyst', 'session-1');
  });

  it('lists creation options and creates an isolated agent session', async () => {
    const deps = dependencies();
    const router = createRemoteGatewayRouter(deps);
    const token = deriveRemoteGatewayToken(seed);

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/session-options',
      origin: allowedOrigin,
      token,
      body: { workspacePath: 'C:\\Code\\Nimbalyst' },
    })).resolves.toMatchObject({
      status: 200,
      body: { providers: [{ id: 'openai-codex' }] },
    });

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/sessions/create',
      origin: allowedOrigin,
      token,
      body: {
        workspacePath: 'C:\\Code\\Nimbalyst',
        provider: 'openai-codex',
        model: 'openai-codex:gpt-5.6-sol',
        prompt: 'Build the feature',
        title: 'Remote build',
        useWorktree: true,
      },
    })).resolves.toMatchObject({ status: 200, body: { sessionId: 'session-new' } });
    expect(deps.createSession).toHaveBeenCalledWith('C:\\Code\\Nimbalyst', {
      provider: 'openai-codex',
      model: 'openai-codex:gpt-5.6-sol',
      prompt: 'Build the feature',
      title: 'Remote build',
      useWorktree: true,
    });
  });

  it('registers web push subscriptions without requiring a workspace body', async () => {
    const deps = dependencies();
    const router = createRemoteGatewayRouter(deps);
    const token = deriveRemoteGatewayToken(seed);

    await expect(router({
      method: 'GET',
      pathname: '/remote/v1/notifications/vapid-public-key',
      origin: allowedOrigin,
      token,
    })).resolves.toEqual({ status: 200, body: { publicKey: 'vapid-public-key' } });

    await expect(router({
      method: 'POST',
      pathname: '/remote/v1/notifications/subscribe',
      origin: allowedOrigin,
      token,
      body: {
        endpoint: 'https://push.example/device',
        keys: { p256dh: 'key', auth: 'auth' },
        deviceLabel: 'iPhone',
      },
    })).resolves.toEqual({ status: 200, body: { success: true } });
    expect(deps.subscribeWebPush).toHaveBeenCalledWith({
      endpoint: 'https://push.example/device',
      keys: { p256dh: 'key', auth: 'auth' },
      deviceLabel: 'iPhone',
    });
  });

  it('returns the desktop usage snapshot without requiring workspace access', async () => {
    const deps = dependencies();
    const router = createRemoteGatewayRouter(deps);

    await expect(router({
      method: 'GET',
      pathname: '/remote/v1/usage',
      origin: allowedOrigin,
      token: deriveRemoteGatewayToken(seed),
    })).resolves.toEqual({
      status: 200,
      body: {
        claude: { fiveHour: { utilization: 20, resetsAt: null } },
        codex: { limits: [] },
      },
    });
    expect(deps.getUsage).toHaveBeenCalledOnce();
  });

  it('projects a bounded transcript without exposing raw tool arguments', () => {
    const transcript = serializeRemoteTranscript([
      {
        id: 1,
        sequence: 1,
        createdAt: new Date('2026-08-22T20:00:00Z'),
        type: 'user_message',
        text: 'Please run the tests.',
        subagentId: null,
      },
      {
        id: 2,
        sequence: 2,
        createdAt: new Date('2026-08-22T20:00:01Z'),
        type: 'tool_call',
        subagentId: null,
        toolCall: {
          toolName: 'Bash',
          toolDisplayName: 'Run command',
          status: 'completed',
          description: 'Ran the focused test suite',
          arguments: { command: 'secret --token hidden' },
          targetFilePath: null,
          mcpServer: null,
          mcpTool: null,
          providerToolCallId: 'tool-1',
          progress: [],
        },
      },
    ]);

    expect(transcript).toMatchObject({ cursor: 2, truncated: false });
    expect(transcript.messages).toHaveLength(2);
    expect(transcript.messages[1]).toMatchObject({ kind: 'tool', label: 'Run command', status: 'completed' });
    expect(JSON.stringify(transcript)).not.toContain('secret --token hidden');
  });

  it('projects only the fields needed to answer a pending permission prompt', () => {
    const prompt = serializeRemotePendingPrompt({
      promptId: 'permission-1',
      promptType: 'permission_request',
      createdAt: 123,
      content: {
        toolName: 'Bash',
        rawCommand: 'npm test',
        isDestructive: false,
        warnings: ['Runs code on the desktop'],
        internalSecret: 'never expose this',
      },
    });

    expect(prompt).toEqual({
      promptId: 'permission-1',
      promptType: 'permission_request',
      createdAt: 123,
      toolName: 'Bash',
      command: 'npm test',
      isDestructive: false,
      warnings: ['Runs code on the desktop'],
    });
    expect(JSON.stringify(prompt)).not.toContain('internalSecret');
  });

  it('preserves AskUserQuestion choices for the remote prompt card', () => {
    const prompt = serializeRemotePendingPrompt({
      promptId: 'question-1',
      promptType: 'ask_user_question_request',
      createdAt: 456,
      content: {
        questions: [{
          header: 'Next step',
          question: 'What should the agent do?',
          options: [
            { label: 'Continue', description: 'Keep working.' },
            { label: 'Stop', description: 'Wait for review.' },
          ],
          multiSelect: false,
        }],
        internalSecret: 'never expose this',
      },
    });

    expect(prompt).toEqual({
      promptId: 'question-1',
      promptType: 'ask_user_question_request',
      createdAt: 456,
      questions: [{
        header: 'Next step',
        question: 'What should the agent do?',
        options: [
          { label: 'Continue', description: 'Keep working.' },
          { label: 'Stop', description: 'Wait for review.' },
        ],
        multiSelect: false,
      }],
    });
    expect(JSON.stringify(prompt)).not.toContain('internalSecret');
  });

  it('labels main-tree and worktree sessions with their real Git locations', () => {
    const worktrees = [{
      id: 'wt-1',
      name: 'luna-review',
      displayName: 'Luna review',
      path: 'C:\\Code\\Nimbalyst_worktrees\\luna-review',
      branch: 'worktree/luna-review',
    }];

    expect(resolveRemoteGitLocation(null, 'C:\\Code\\Nimbalyst', 'feat/main-session', worktrees)).toEqual({
      kind: 'main',
      name: 'Main working tree',
      path: 'C:\\Code\\Nimbalyst',
      branch: 'feat/main-session',
    });
    expect(resolveRemoteGitLocation('wt-1', 'C:\\Code\\Nimbalyst', 'feat/main-session', worktrees)).toEqual({
      kind: 'worktree',
      name: 'Luna review',
      path: 'C:\\Code\\Nimbalyst_worktrees\\luna-review',
      branch: 'worktree/luna-review',
    });
  });
});
