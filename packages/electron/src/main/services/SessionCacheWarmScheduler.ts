import log from 'electron-log/main';

const logger = log.scope('SessionCacheWarmScheduler');

export const CACHE_WARM_INTERVAL_MS = 50 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

export interface CacheWarmView {
  cacheWarmEnabled: boolean;
  cacheWarmNextAt: number | null;
  cacheWarmLastAt?: number | null;
  cacheWarmLastStatus?: 'success' | 'failed' | null;
}

interface CacheWarmSession {
  id: string;
  workspacePath?: string;
  workspaceId?: string;
  updatedAt: number;
  isArchived?: boolean;
  metadata?: Record<string, unknown>;
  cacheWarmEnabled?: boolean;
  cacheWarmNextAt?: number;
}

interface SessionCacheWarmSchedulerDeps {
  loadSession: (sessionId: string) => Promise<CacheWarmSession | null>;
  updateMetadata: (sessionId: string, metadata: CacheWarmView) => Promise<void>;
  executor: (args: { sessionId: string; workspacePath: string }) => Promise<{ triggered: boolean }>;
  broadcastChanged: (sessionId: string, view: CacheWarmView) => void;
  now?: () => number;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function policyFromSession(session: CacheWarmSession): CacheWarmView {
  const metadata = session.metadata ?? {};
  return {
    cacheWarmEnabled: session.cacheWarmEnabled === true || metadata.cacheWarmEnabled === true,
    cacheWarmNextAt: finiteNumber(session.cacheWarmNextAt ?? metadata.cacheWarmNextAt),
    cacheWarmLastAt: finiteNumber(metadata.cacheWarmLastAt),
    cacheWarmLastStatus: metadata.cacheWarmLastStatus === 'success' || metadata.cacheWarmLastStatus === 'failed'
      ? metadata.cacheWarmLastStatus
      : null,
  };
}

export class SessionCacheWarmScheduler {
  private static instance: SessionCacheWarmScheduler | null = null;
  private deps: SessionCacheWarmSchedulerDeps | null = null;
  private timers = new Map<string, NodeJS.Timeout>();
  private pendingSyncSessions: CacheWarmSession[] = [];

  static getInstance(): SessionCacheWarmScheduler {
    if (!this.instance) this.instance = new SessionCacheWarmScheduler();
    return this.instance;
  }

  configure(deps: SessionCacheWarmSchedulerDeps): void {
    this.stop();
    this.deps = deps;
    if (this.pendingSyncSessions.length > 0) {
      const pending = this.pendingSyncSessions;
      this.pendingSyncSessions = [];
      this.syncSessions(pending);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  async setEnabled(sessionId: string, enabled: boolean): Promise<CacheWarmView> {
    if (!this.deps) throw new Error('SessionCacheWarmScheduler is not configured');
    const session = await this.deps.loadSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    this.clearTimer(sessionId);
    if (!enabled) {
      const view: CacheWarmView = { cacheWarmEnabled: false, cacheWarmNextAt: null };
      await this.persist(sessionId, view);
      return view;
    }

    const now = this.now();
    const lastActivityAt = Number.isFinite(session.updatedAt) ? session.updatedAt : now;
    const firstRefreshAt = Math.max(now, lastActivityAt + CACHE_WARM_INTERVAL_MS);
    const view: CacheWarmView = {
      cacheWarmEnabled: true,
      cacheWarmNextAt: firstRefreshAt,
      cacheWarmLastAt: null,
      cacheWarmLastStatus: null,
    };
    await this.persist(sessionId, view);
    this.arm(sessionId, view.cacheWarmNextAt!);
    return view;
  }

  syncSessions(sessions: CacheWarmSession[]): void {
    if (!this.deps) {
      this.pendingSyncSessions = sessions;
      return;
    }
    const now = this.now();
    for (const session of sessions) {
      const policy = policyFromSession(session);
      if (session.isArchived || !policy.cacheWarmEnabled) {
        this.clearTimer(session.id);
        continue;
      }
      const nextAt = policy.cacheWarmNextAt ?? now + CACHE_WARM_INTERVAL_MS;
      this.arm(session.id, Math.max(now, nextAt));
    }
  }

  private now(): number {
    return this.deps?.now?.() ?? Date.now();
  }

  private clearTimer(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  private arm(sessionId: string, fireAt: number): void {
    this.clearTimer(sessionId);
    const timer = setTimeout(() => void this.fire(sessionId), Math.max(0, fireAt - this.now()));
    this.timers.set(sessionId, timer);
  }

  private async fire(sessionId: string): Promise<void> {
    if (!this.deps) return;
    this.timers.delete(sessionId);
    const session = await this.deps.loadSession(sessionId);
    if (!session || session.isArchived) return;
    const policy = policyFromSession(session);
    const now = this.now();
    if (!policy.cacheWarmEnabled) return;
    const workspacePath = session.workspacePath ?? session.workspaceId;
    if (!workspacePath) return;

    if (session.metadata?.hasPendingPrompt === true) {
      const retryAt = now + RETRY_MS;
      const view: CacheWarmView = {
        ...policy,
        cacheWarmNextAt: retryAt,
      };
      await this.persist(sessionId, view);
      if (view.cacheWarmNextAt) this.arm(sessionId, view.cacheWarmNextAt);
      return;
    }

    try {
      const result = await this.deps.executor({ sessionId, workspacePath });
      if (!result.triggered) throw new Error('Cache refresh could not be dispatched');
      const nextAt = now + CACHE_WARM_INTERVAL_MS;
      const view: CacheWarmView = {
        ...policy,
        cacheWarmLastAt: now,
        cacheWarmLastStatus: 'success',
        cacheWarmNextAt: nextAt,
      };
      await this.persist(sessionId, view);
      if (view.cacheWarmNextAt) this.arm(sessionId, view.cacheWarmNextAt);
    } catch (error) {
      logger.warn('Cache warm refresh failed', { sessionId, error });
      const retryAt = now + RETRY_MS;
      const view: CacheWarmView = {
        ...policy,
        cacheWarmLastAt: now,
        cacheWarmLastStatus: 'failed',
        cacheWarmNextAt: retryAt,
      };
      await this.persist(sessionId, view);
      if (view.cacheWarmNextAt) this.arm(sessionId, view.cacheWarmNextAt);
    }
  }

  private async persist(sessionId: string, view: CacheWarmView): Promise<void> {
    if (!this.deps) return;
    await this.deps.updateMetadata(sessionId, view);
    this.deps.broadcastChanged(sessionId, view);
  }
}
