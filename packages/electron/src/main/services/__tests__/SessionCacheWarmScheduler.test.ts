// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_WARM_INTERVAL_MS,
  SessionCacheWarmScheduler,
} from '../SessionCacheWarmScheduler';

describe('SessionCacheWarmScheduler', () => {
  afterEach(() => {
    SessionCacheWarmScheduler.getInstance().stop();
    vi.useRealTimers();
  });

  it('persists an enabled policy and refreshes before the one-hour TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const metadata: Record<string, unknown> = {};
    const executor = vi.fn().mockResolvedValue({ triggered: true });
    const broadcastChanged = vi.fn();
    const scheduler = SessionCacheWarmScheduler.getInstance();
    scheduler.configure({
      loadSession: async () => ({
        id: 'session-1',
        workspacePath: 'C:/workspace',
        updatedAt: Date.now(),
        metadata,
      }),
      updateMetadata: async (_sessionId, updates) => { Object.assign(metadata, updates); },
      executor,
      broadcastChanged,
    });

    const policy = await scheduler.setEnabled('session-1', true);
    expect(policy.cacheWarmEnabled).toBe(true);
    expect(policy.cacheWarmNextAt).toBe(Date.now() + CACHE_WARM_INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(CACHE_WARM_INTERVAL_MS);

    expect(executor).toHaveBeenCalledWith({ sessionId: 'session-1', workspacePath: 'C:/workspace' });
    expect(metadata.cacheWarmLastStatus).toBe('success');
    expect(broadcastChanged).toHaveBeenCalled();
  });

  it('cancels the timer and clears the persisted policy', async () => {
    vi.useFakeTimers();
    const metadata: Record<string, unknown> = {};
    const executor = vi.fn().mockResolvedValue({ triggered: true });
    const scheduler = SessionCacheWarmScheduler.getInstance();
    scheduler.configure({
      loadSession: async () => ({ id: 'session-2', workspacePath: 'C:/workspace', updatedAt: Date.now(), metadata }),
      updateMetadata: async (_sessionId, updates) => { Object.assign(metadata, updates); },
      executor,
      broadcastChanged: vi.fn(),
    });

    await scheduler.setEnabled('session-2', true);
    await scheduler.setEnabled('session-2', false);
    await vi.advanceTimersByTimeAsync(CACHE_WARM_INTERVAL_MS);

    expect(executor).not.toHaveBeenCalled();
    expect(metadata.cacheWarmEnabled).toBe(false);
    expect(metadata.cacheWarmNextAt).toBeNull();
  });

  it('bases the first refresh on existing session activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(CACHE_WARM_INTERVAL_MS - (5 * 60 * 1000));
    const metadata: Record<string, unknown> = {};
    const executor = vi.fn().mockResolvedValue({ triggered: true });
    const scheduler = SessionCacheWarmScheduler.getInstance();
    scheduler.configure({
      loadSession: async () => ({ id: 'session-activity', workspacePath: 'C:/workspace', updatedAt: 0, metadata }),
      updateMetadata: async (_sessionId, updates) => { Object.assign(metadata, updates); },
      executor,
      broadcastChanged: vi.fn(),
    });

    const policy = await scheduler.setEnabled('session-activity', true);
    expect(policy.cacheWarmNextAt).toBe(CACHE_WARM_INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(executor).toHaveBeenCalledOnce();
  });

  it('continues refreshing beyond two hours until disabled', async () => {
    vi.useFakeTimers();
    const metadata: Record<string, unknown> = {};
    const executor = vi.fn().mockResolvedValue({ triggered: true });
    const scheduler = SessionCacheWarmScheduler.getInstance();
    scheduler.configure({
      loadSession: async () => ({ id: 'session-overnight', workspacePath: 'C:/workspace', updatedAt: Date.now(), metadata }),
      updateMetadata: async (_sessionId, updates) => { Object.assign(metadata, updates); },
      executor,
      broadcastChanged: vi.fn(),
    });

    await scheduler.setEnabled('session-overnight', true);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(executor).toHaveBeenCalledTimes(3);
    expect(metadata.cacheWarmEnabled).toBe(true);
    expect(metadata.cacheWarmNextAt).toBeGreaterThan(Date.now());
  });

  it('remains enabled and refreshes immediately after a long restart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(4 * 60 * 60 * 1000);
    const metadata: Record<string, unknown> = {
      cacheWarmEnabled: true,
      cacheWarmNextAt: CACHE_WARM_INTERVAL_MS,
    };
    const executor = vi.fn().mockResolvedValue({ triggered: true });
    const scheduler = SessionCacheWarmScheduler.getInstance();
    scheduler.configure({
      loadSession: async () => ({ id: 'session-restart', workspacePath: 'C:/workspace', updatedAt: 0, metadata }),
      updateMetadata: async (_sessionId, updates) => { Object.assign(metadata, updates); },
      executor,
      broadcastChanged: vi.fn(),
    });

    scheduler.syncSessions([{
      id: 'session-restart',
      workspacePath: 'C:/workspace',
      updatedAt: 0,
      metadata,
    }]);
    await vi.advanceTimersByTimeAsync(0);

    expect(executor).toHaveBeenCalledOnce();
    expect(metadata.cacheWarmEnabled).toBe(true);
  });

  it('does not refresh through an unresolved interactive prompt', async () => {
    vi.useFakeTimers();
    const metadata: Record<string, unknown> = { hasPendingPrompt: true };
    const executor = vi.fn().mockResolvedValue({ triggered: true });
    const scheduler = SessionCacheWarmScheduler.getInstance();
    scheduler.configure({
      loadSession: async () => ({ id: 'session-3', workspacePath: 'C:/workspace', updatedAt: Date.now(), metadata }),
      updateMetadata: async (_sessionId, updates) => { Object.assign(metadata, updates); },
      executor,
      broadcastChanged: vi.fn(),
    });

    await scheduler.setEnabled('session-3', true);
    await vi.advanceTimersByTimeAsync(CACHE_WARM_INTERVAL_MS);

    expect(executor).not.toHaveBeenCalled();
    expect(metadata.cacheWarmNextAt).toBeGreaterThan(Date.now());
  });
});
