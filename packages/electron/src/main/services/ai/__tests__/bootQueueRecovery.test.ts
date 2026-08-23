// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  driveStrandedQueuesOnBoot,
  RESTARTED_PROMPT_ERROR,
} from '../bootQueueRecovery';

type DepOverrides = Partial<Parameters<typeof driveStrandedQueuesOnBoot>[0]>;

function createDeps(overrides: DepOverrides = {}) {
  return {
    listSessionIdsWithPending: vi.fn(async () => [] as string[]),
    failPending: vi.fn(async () => 1),
    logInfo: vi.fn(),
    ...overrides,
  };
}

describe('driveStrandedQueuesOnBoot', () => {
  it('quarantines each pre-restart queue instead of executing it', async () => {
    const deps = createDeps({
      listSessionIdsWithPending: vi.fn(async () => ['s1', 's2', 's3']),
    });

    const quarantined = await driveStrandedQueuesOnBoot(deps);

    expect(quarantined).toBe(3);
    expect(deps.failPending).toHaveBeenNthCalledWith(1, 's1', RESTARTED_PROMPT_ERROR);
    expect(deps.failPending).toHaveBeenNthCalledWith(2, 's2', RESTARTED_PROMPT_ERROR);
    expect(deps.failPending).toHaveBeenNthCalledWith(3, 's3', RESTARTED_PROMPT_ERROR);
  });

  it('drives nothing when the boot sweep left no pending rows', async () => {
    // Rows the sweep resolved (delivered-and-answered, or delivered-but-
    // unanswered) are no longer 'pending', so they must not be re-sent.
    // NIM-615 / #783.
    const deps = createDeps();

    expect(await driveStrandedQueuesOnBoot(deps)).toBe(0);
    expect(deps.failPending).not.toHaveBeenCalled();
    expect(deps.logInfo).not.toHaveBeenCalled();
  });

  it('counts only sessions whose pending rows were actually quarantined', async () => {
    const deps = createDeps({
      listSessionIdsWithPending: vi.fn(async () => ['already-claimed', 'stale']),
      failPending: vi.fn(async (sessionId: string) => sessionId === 'stale' ? 1 : 0),
    });

    expect(await driveStrandedQueuesOnBoot(deps)).toBe(1);
    expect(deps.failPending).toHaveBeenCalledTimes(2);
  });
});
