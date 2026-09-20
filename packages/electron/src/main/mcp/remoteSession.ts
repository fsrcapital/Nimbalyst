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

function normalizePathForComparison(value: string): string {
  return value.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
}

function displayNameFromWorktreePath(worktreePath: string): string {
  const pathWithoutTrailingSeparator = worktreePath.replace(/[\\/]+$/, '');
  const segments = pathWithoutTrailingSeparator.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || 'Git worktree';
}

export function resolveRemoteGitLocation(
  worktreeId: string | null,
  workspacePath: string,
  mainBranch: string,
  worktrees: WorktreeIdentity[],
  worktreePath?: string | null,
): RemoteGitLocation {
  const worktree = worktreeId
    ? worktrees.find((candidate) => candidate.id === worktreeId)
    : worktreePath
      ? worktrees.find((candidate) => (
        normalizePathForComparison(candidate.path) === normalizePathForComparison(worktreePath)
      ))
      : undefined;

  if (worktreeId || (worktreePath && normalizePathForComparison(worktreePath) !== normalizePathForComparison(workspacePath))) {
    return {
      kind: 'worktree',
      name: worktree?.displayName || worktree?.name || displayNameFromWorktreePath(worktreePath || workspacePath),
      path: worktree?.path || worktreePath || workspacePath,
      branch: worktree?.branch || '',
    };
  }

  return {
    kind: 'main',
    name: 'Main working tree',
    path: workspacePath,
    branch: mainBranch,
  };
}
