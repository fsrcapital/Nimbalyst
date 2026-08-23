export type WorkspaceReference = { path: string; name: string };
export type WorkspaceSessionReference = { workspacePath: string };

export function chooseWorkspacePath(
  workspaces: WorkspaceReference[],
  currentPath: string,
): string {
  return workspaces.some((workspace) => workspace.path === currentPath)
    ? currentPath
    : (workspaces[0]?.path ?? "");
}

export function sessionsForWorkspace<T extends WorkspaceSessionReference>(
  sessions: T[],
  workspacePath: string,
): T[] {
  return sessions.filter((session) => session.workspacePath === workspacePath);
}
