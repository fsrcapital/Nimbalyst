// @vitest-environment node
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { scanCodexSessions } from '../CodexSessionScanner';
import { syncCodexSession } from '../CodexSessionSync';

describe('Codex session import', () => {
  it('discovers rollout history, preserves timestamps, and creates a resumable Codex session', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'nimbalyst-codex-import-'));
    const dayDir = join(codexHome, 'sessions', '2026', '08', '23');
    await mkdir(dayDir, { recursive: true });
    const filePath = join(dayDir, 'rollout-2026-08-23T10-00-00-thread-123.jsonl');
    const rows = [
      { timestamp: '2026-08-23T10:00:00.000Z', type: 'session_meta', payload: { id: 'thread-123', cwd: 'C:\\Code\\Project' } },
      { timestamp: '2026-08-23T10:00:01.000Z', type: 'turn_context', payload: { turn_id: 'turn-1', cwd: 'C:\\Code\\Project', model: 'gpt-5.6-sol' } },
      { timestamp: '2026-08-23T10:00:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'Fix the import bug' } },
      { timestamp: '2026-08-23T10:00:03.000Z', type: 'response_item', payload: { type: 'message', id: 'msg-1', role: 'assistant', content: [{ type: 'output_text', text: 'I found it.' }] } },
      { timestamp: '2026-08-23T10:00:04.000Z', type: 'response_item', payload: { type: 'function_call', id: 'call-item-1', call_id: 'call-1', name: 'shell', arguments: '{"cmd":"npm test"}' } },
      { timestamp: '2026-08-23T10:00:05.000Z', type: 'response_item', payload: { type: 'function_call_output', id: 'out-1', call_id: 'call-1', output: 'passed' } },
      { timestamp: '2026-08-23T10:00:06.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 30, output_tokens: 12 } } } },
    ];
    await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join('\n'));

    const [metadata] = await scanCodexSessions({ codexHome, workspacePath: 'C:\\Code\\Project' });
    expect(metadata).toMatchObject({
      sessionId: 'thread-123',
      workspacePath: 'C:\\Code\\Project',
      title: 'Fix the import bug',
      model: 'gpt-5.6-sol',
      // Discovery reads only the rollout header. Full message counting and
      // token parsing are deferred until the user selects a session to import.
      messageCount: null,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    const sessionStore = {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const messagesStore = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncCodexSession(sessionStore as never, messagesStore as never, metadata);

    expect(result).toEqual({ sessionId: 'thread-123', success: true, messagesAdded: 3 });
    expect(sessionStore.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'thread-123',
      provider: 'openai-codex',
      providerSessionId: 'thread-123',
      model: 'openai-codex:gpt-5.6-sol',
      title: 'Fix the import bug',
      providerConfig: expect.objectContaining({
        tokenUsage: { inputTokens: 30, outputTokens: 12, totalTokens: 42 },
      }),
    }));
    expect(messagesStore.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      direction: 'input',
      createdAt: new Date('2026-08-23T10:00:02.000Z'),
    }));
    expect(messagesStore.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      direction: 'output',
      metadata: expect.objectContaining({ transport: 'app-server' }),
    }));
    const importedTool = JSON.parse(messagesStore.create.mock.calls[2][0].content);
    expect(importedTool.params.item).toMatchObject({
      id: 'call-item-1',
      type: 'shell',
      status: 'completed',
      result: 'passed',
    });
  });
});
