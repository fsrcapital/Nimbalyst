import type { SessionMeta } from "@nimbalyst/runtime/ai/adapters/sessionStore";

/** Normalize the lightweight IPC list into the renderer registry. */
export function sessionListMetadata(
  s: Partial<SessionMeta> & Pick<SessionMeta, "id" | "createdAt" | "updatedAt">,
  workspacePath: string
): SessionMeta {
  return {
    id: s.id,
    ...(s.remoteHostDeviceId && { remoteHostDeviceId: s.remoteHostDeviceId }),
    title: s.title || "Untitled Session",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    provider: s.provider || "claude",
    model: s.model,
    externalSource: s.externalSource,
    externalLastActivityAt: s.externalLastActivityAt,
    sessionType: s.sessionType || "session",
    agentRole: s.agentRole || "standard",
    createdBySessionId: s.createdBySessionId || null,
    messageCount: s.messageCount || 0,
    workspaceId: workspacePath,
    isArchived: s.isArchived || false,
    isPinned: s.isPinned || false,
    parentSessionId: s.parentSessionId || null,
    worktreeId: s.worktreeId || null,
    childCount: s.childCount || 0,
    uncommittedCount: s.uncommittedCount || 0,
    // Kanban board phase and tags from metadata JSONB
    ...(s.phase && { phase: s.phase }),
    ...(s.tags && { tags: s.tags }),
    // Linked tracker item IDs from metadata JSONB
    ...(s.linkedTrackerItemIds && {
      linkedTrackerItemIds: s.linkedTrackerItemIds,
    }),
    ...(s.agentRole && { agentRole: s.agentRole }),
    ...(s.createdBySessionId !== undefined && {
      createdBySessionId: s.createdBySessionId,
    }),
    ...(typeof s.cacheWarmEnabled === 'boolean' && { cacheWarmEnabled: s.cacheWarmEnabled }),
    ...(typeof s.cacheWarmNextAt === 'number' && { cacheWarmNextAt: s.cacheWarmNextAt }),
    ...(typeof s.cacheWarmLastAt === 'number' && { cacheWarmLastAt: s.cacheWarmLastAt }),
    ...((s.cacheWarmLastStatus === 'success' || s.cacheWarmLastStatus === 'failed') && {
      cacheWarmLastStatus: s.cacheWarmLastStatus,
    }),
    ...(typeof s.activeSubagentCount === 'number' && { activeSubagentCount: s.activeSubagentCount }),
    ...(typeof s.myNotes === 'string' && { myNotes: s.myNotes }),
    ...(typeof s.nextAction === 'string' && { nextAction: s.nextAction }),
    ...(typeof s.waitingOn === 'string' && { waitingOn: s.waitingOn }),
    ...(Array.isArray(s.attentionReasons) && { attentionReasons: s.attentionReasons }),
    ...(typeof s.needsAttention === 'boolean' && { needsAttention: s.needsAttention }),
  };
}
