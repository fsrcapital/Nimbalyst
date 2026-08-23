export type RemoteSessionProvider = 'claude-code' | 'openai-codex';

export interface RemoteSessionCreationOptions {
  providers: Array<{
    id: RemoteSessionProvider;
    label: string;
    models: Array<{ id: string; label: string }>;
  }>;
}

export interface RemoteSessionCreationInput {
  provider: RemoteSessionProvider;
  model: string;
  prompt: string;
  title?: string;
  useWorktree: boolean;
}

export interface ResolvedRemoteSessionCreation extends RemoteSessionCreationInput {
  title: string;
}

function deriveTitle(prompt: string): string {
  const firstLine = prompt.split('\n')[0]?.trim() || 'New session';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

export function resolveRemoteSessionCreation(
  options: RemoteSessionCreationOptions,
  input: RemoteSessionCreationInput,
): ResolvedRemoteSessionCreation {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('prompt is required');
  const provider = options.providers.find((candidate) => candidate.id === input.provider);
  if (!provider) throw new Error(`${input.provider} is not enabled for this workspace.`);
  if (!provider.models.some((model) => model.id === input.model)) {
    throw new Error(`Model ${input.model} is not available for ${provider.label}.`);
  }
  return {
    provider: input.provider,
    model: input.model,
    prompt,
    title: input.title?.trim() || deriveTitle(prompt),
    useWorktree: input.useWorktree === true,
  };
}
