export interface RemoteGitLocation {
  kind: 'main' | 'worktree';
  name: string;
  path: string;
  branch: string;
}

interface WorktreeIdentity {
  id: string;
  name: string;
  displayName?: string;
  path: string;
  branch: string;
}

export function resolveRemoteGitLocation(
  worktreeId: string | null,
  workspacePath: string,
  mainBranch: string,
  worktrees: WorktreeIdentity[],
): RemoteGitLocation {
  if (!worktreeId) {
    return {
      kind: 'main',
      name: 'Main working tree',
      path: workspacePath,
      branch: mainBranch,
    };
  }

  const worktree = worktrees.find((candidate) => candidate.id === worktreeId);
  return {
    kind: 'worktree',
    name: worktree?.displayName || worktree?.name || 'Git worktree',
    path: worktree?.path || workspacePath,
    branch: worktree?.branch || '',
  };
}
