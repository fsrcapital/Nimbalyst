// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asPersonalJwt, asPersonalMemberId } from '../../auth/jwtScopes';
import { createCollabV3Sync } from '../CollabV3Sync';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

function jwtFor(subject: string): string {
  const payload = btoa(JSON.stringify({ sub: subject }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

async function establishIndexCoverage(
  provider: ReturnType<typeof createCollabV3Sync>,
  socket: FakeWebSocket,
): Promise<void> {
  const fetching = provider.fetchIndex!();
  await vi.waitFor(() => expect(socket.send.mock.calls.some(([payload]) => JSON.parse(payload as string).type === 'indexPageRequest')).toBe(true));
  const request = socket.send.mock.calls
    .map(([payload]) => JSON.parse(payload as string))
    .find((message) => message.type === 'indexPageRequest');
  socket.receive({
    type: 'indexPageResponse',
    protocolVersion: 2,
    requestId: request.requestId,
    mode: 'bootstrap',
    entries: [],
    complete: true,
    cursor: 0,
  });
  await fetching;
}

describe('CollabV3 index broadcast decryption', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores a broadcast encrypted with a different pairing key', async () => {
    const oldKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const oldProvider = createCollabV3Sync({
      serverUrl: 'wss://sync.example.test',
      orgId: 'org-1',
      personalMemberId: asPersonalMemberId('user-1'),
      getJwt: async () => asPersonalJwt(jwtFor('user-1')),
      encryptionKey: oldKey,
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const oldSocket = FakeWebSocket.instances[0];
    oldSocket.open();
    await establishIndexCoverage(oldProvider, oldSocket);
    const now = Date.now();
    await oldProvider.syncSessionsToIndex?.([{
      id: 'old-session',
      title: 'Old pairing',
      provider: 'openai-codex',
      mode: 'agent',
      workspaceId: '/workspace',
      messageCount: 0,
      updatedAt: now,
      createdAt: now,
    }]);
    await vi.waitFor(() => expect(oldSocket.send.mock.calls.some(([payload]) => {
      const message = JSON.parse(payload as string);
      return message.type === 'indexUpdate' || message.type === 'indexBatchUpdate';
    })).toBe(true));
    const publication = oldSocket.send.mock.calls
      .map(([payload]) => JSON.parse(payload as string))
      .find((message) => message.type === 'indexUpdate' || message.type === 'indexBatchUpdate');
    const encryptedSession = publication?.session ?? publication?.sessions?.[0];
    expect(encryptedSession).toBeDefined();
    oldProvider.disconnectAll();

    FakeWebSocket.instances = [];
    const currentKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const currentProvider = createCollabV3Sync({
      serverUrl: 'wss://sync.example.test',
      orgId: 'org-1',
      personalMemberId: asPersonalMemberId('user-1'),
      getJwt: async () => asPersonalJwt(jwtFor('user-1')),
      encryptionKey: currentKey,
    });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const currentSocket = FakeWebSocket.instances[0];
    currentSocket.open();
    const listener = vi.fn();
    currentProvider.onIndexChange?.(listener);
    currentSocket.receive({ type: 'indexBroadcast', session: encryptedSession });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(currentProvider.getCachedIndexEntry?.('old-session')).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    currentProvider.disconnectAll();
  });
});
