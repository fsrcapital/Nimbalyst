import * as path from 'path';
import { getWebAppAccessConfig } from '../utils/store';

/** The sole workspace authorization source for the direct Web App gateway. */
export function listRemoteGatewayWorkspaces(): Array<{ path: string; name: string }> {
  return Array.from(new Set(getWebAppAccessConfig().enabledProjects)).map((workspacePath) => ({
    path: workspacePath,
    name: path.basename(workspacePath),
  }));
}
