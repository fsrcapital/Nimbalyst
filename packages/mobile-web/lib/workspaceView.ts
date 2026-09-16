export type WorkspaceReference = { path: string; name: string };
export type WorkspaceSessionReference = { workspacePath: string };

const workspaceQueryParameter = "workspace";

export function workspacePathFromUrl(href: string): string {
  try {
    return new URL(href).searchParams.get(workspaceQueryParameter) ?? "";
  } catch {
    return "";
  }
}

export function withWorkspacePath(href: string, workspacePath: string): string {
  const url = new URL(href);
  if (workspacePath) url.searchParams.set(workspaceQueryParameter, workspacePath);
  else url.searchParams.delete(workspaceQueryParameter);
  return url.toString();
}

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
