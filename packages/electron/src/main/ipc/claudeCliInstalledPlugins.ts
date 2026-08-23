export interface ClaudeCliInstalledPlugins {
  version: number;
  plugins: Record<string, Array<{
    scope: 'user' | 'project';
    projectPath?: string;
    installPath: string;
    version: string;
    installedAt: string;
    lastUpdated: string;
  }>>;
}

export function parseClaudeCliInstalledPluginsJson(content: string): ClaudeCliInstalledPlugins {
  return JSON.parse(content.replace(/^\uFEFF/, '')) as ClaudeCliInstalledPlugins;
}
