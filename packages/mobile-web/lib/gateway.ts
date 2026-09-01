import type { PairingAccount, RemoteGatewayPairing } from "./pairing";

export type GatewayWorkspace = { path: string; name: string };

export type GatewaySession = {
  id: string;
  title: string;
  provider: string;
  model?: string;
  workspaceId: string;
  worktreeId: string | null;
  updatedAt: number;
  status?: string;
  phase?: string;
  myNotes?: string;
  nextAction?: string;
  waitingOn?: string;
  attentionReasons?: string[];
  needsAttention?: boolean;
  hasPendingInteractivePrompt?: boolean;
  activeSubagentCount?: number;
  gitLocation?: {
    kind: "main" | "worktree";
    name: string;
    path: string;
    branch: string;
  };
};

export type GatewayTranscriptMessage = {
  id: string;
  sequence: number;
  createdAt: number;
  kind: "user" | "assistant" | "system" | "tool" | "interactive";
  label: string;
  text: string;
  status?: string;
  isError?: boolean;
};

export type GatewayPendingPrompt =
  | {
      promptId: string;
      promptType: "permission_request";
      createdAt: number;
      toolName: string;
      command: string;
      isDestructive: boolean;
      warnings: string[];
    }
  | {
      promptId: string;
      promptType: "ask_user_question_request";
      createdAt: number;
      questions: Array<{
        question: string;
        header: string;
        options: Array<{ label: string; description: string }>;
        multiSelect: boolean;
      }>;
    }
  | {
      promptId: string;
      promptType: "exit_plan_mode_request";
      createdAt: number;
      planFilePath?: string;
    };

export type GatewayTranscript = {
  messages: GatewayTranscriptMessage[];
  cursor: number;
  truncated: boolean;
  pendingPrompt?: GatewayPendingPrompt | null;
};

export interface GatewaySessionCreationOptions {
  providers: Array<{
    id: "claude-code" | "openai-codex";
    label: string;
    models: Array<{ id: string; label: string }>;
  }>;
}

export interface GatewayCreateSessionInput {
  provider: "claude-code" | "openai-codex";
  model: string;
  prompt: string;
  title?: string;
  useWorktree: boolean;
}

export type GatewayUsage = {
  claude: {
    fiveHour?: { utilization?: number; resetsAt?: string | null };
    sevenDay?: { utilization?: number; resetsAt?: string | null };
    sevenDayOpus?: { utilization?: number; resetsAt?: string | null };
    error?: string;
  } | null;
  codex: {
    limits?: Array<{
      id?: string;
      name?: string | null;
      windows?: Array<{
        slot?: "primary" | "secondary";
        usedPercent?: number;
        windowDurationMins?: number | null;
        resetsAt?: string | null;
      }>;
    }>;
    error?: string;
  } | null;
};

export interface GatewayCreatedSession {
  sessionId: string;
  title: string;
  provider?: string;
  model?: string;
  worktreeId?: string | null;
}

export function normalizeGatewayUrl(value: string): string {
  const candidate = value.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter the complete HTTPS address from Tailscale.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("The desktop gateway must use HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Enter only the desktop gateway address.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function gatewayFor(account: PairingAccount): RemoteGatewayPairing & { url: string } {
  const gateway = account.remoteGateway;
  if (!gateway?.url) throw new Error("Connect this device to the desktop gateway first.");
  return { ...gateway, url: normalizeGatewayUrl(gateway.url) };
}

async function request<T>(account: PairingAccount, path: string, body?: Record<string, unknown>): Promise<T> {
  const gateway = gatewayFor(account);
  let response: Response;
  try {
    response = await fetch(`${gateway.url}/remote/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach the desktop. Check Tailscale and keep Nimbalyst running.");
  }
  const responseText = await response.text();
  let payload: { error?: string } | T;
  try {
    payload = responseText ? JSON.parse(responseText) as { error?: string } | T : {} as T;
  } catch {
    throw new Error(
      "The desktop gateway returned an unexpected response. Check that Tailscale points to the Nimbalyst fork on port 3457.",
    );
  }
  if (!response.ok) throw new Error(payload.error ?? `Desktop gateway returned ${response.status}.`);
  return payload as T;
}

export async function checkGateway(account: PairingAccount): Promise<void> {
  await request<{ status: "ok" }>(account, "/health");
}

export type GatewayWebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceLabel?: string;
};

export async function getGatewayWebPushPublicKey(account: PairingAccount): Promise<string> {
  const payload = await request<{ publicKey?: string }>(account, "/notifications/vapid-public-key");
  if (typeof payload.publicKey !== "string" || !payload.publicKey) {
    throw new Error("The desktop returned an invalid notification key. Restart the fork and try again.");
  }
  return payload.publicKey;
}

export async function subscribeGatewayWebPush(
  account: PairingAccount,
  subscription: GatewayWebPushSubscription,
): Promise<void> {
  await request(account, "/notifications/subscribe", subscription);
}

export async function unsubscribeGatewayWebPush(account: PairingAccount, endpoint: string): Promise<void> {
  await request(account, "/notifications/unsubscribe", { endpoint });
}

export async function listGatewayWorkspaces(account: PairingAccount): Promise<GatewayWorkspace[]> {
  const payload = await request<{ workspaces?: GatewayWorkspace[] } | GatewayWorkspace[]>(account, "/workspaces");
  const workspaces = Array.isArray(payload) ? payload : payload.workspaces;
  if (!Array.isArray(workspaces)) {
    throw new Error("The desktop returned an invalid workspace list. Restart the fork and try again.");
  }
  if (workspaces.length === 0) {
    throw new Error(
      "No projects are enabled for Web App access. On the desktop, open Settings → Account → Web App and select a project.",
    );
  }
  return workspaces;
}

export async function getGatewayUsage(account: PairingAccount): Promise<GatewayUsage> {
  const payload = await request<GatewayUsage>(account, "/usage");
  if (!payload || typeof payload !== "object") {
    throw new Error("The desktop returned invalid usage information. Restart the fork and try again.");
  }
  return payload;
}

export async function listGatewaySessions(account: PairingAccount, workspacePath: string): Promise<GatewaySession[]> {
  const payload = await request<{ sessions?: GatewaySession[] } | GatewaySession[]>(account, "/sessions/list", { workspacePath });
  const sessions = Array.isArray(payload) ? payload : payload.sessions;
  if (!Array.isArray(sessions)) {
    throw new Error("The desktop returned an invalid session list. Restart the fork and try again.");
  }
  return sessions;
}

export async function listGatewaySessionCreationOptions(
  account: PairingAccount,
  workspacePath: string,
): Promise<GatewaySessionCreationOptions> {
  const payload = await request<Partial<GatewaySessionCreationOptions>>(
    account,
    "/session-options",
    { workspacePath },
  );
  if (!Array.isArray(payload.providers)) {
    throw new Error("The desktop returned invalid session creation options. Restart the fork and try again.");
  }
  return { providers: payload.providers as GatewaySessionCreationOptions["providers"] };
}

export async function createGatewaySession(
  account: PairingAccount,
  workspacePath: string,
  input: GatewayCreateSessionInput,
): Promise<GatewayCreatedSession> {
  const payload = await request<Partial<GatewayCreatedSession>>(
    account,
    "/sessions/create",
    { workspacePath, ...input },
  );
  if (typeof payload.sessionId !== "string" || typeof payload.title !== "string") {
    throw new Error("The desktop returned an invalid new session. Restart the fork and try again.");
  }
  return payload as GatewayCreatedSession;
}

export async function updateGatewayWorkflow(
  account: PairingAccount,
  workspacePath: string,
  sessionId: string,
  workflow: Pick<GatewaySession, "myNotes" | "nextAction" | "waitingOn" | "attentionReasons">,
): Promise<void> {
  await request(account, `/sessions/${encodeURIComponent(sessionId)}/workflow`, { workspacePath, ...workflow });
}

export async function getGatewayTranscript(
  account: PairingAccount,
  workspacePath: string,
  sessionId: string,
): Promise<GatewayTranscript> {
  const payload = await request<Partial<GatewayTranscript>>(
    account,
    `/sessions/${encodeURIComponent(sessionId)}/transcript`,
    { workspacePath },
  );
  if (!Array.isArray(payload.messages)) {
    throw new Error("The desktop returned an invalid transcript. Restart the fork and try again.");
  }
  return {
    messages: payload.messages,
    cursor: typeof payload.cursor === "number" ? payload.cursor : 0,
    truncated: payload.truncated === true,
    pendingPrompt: payload.pendingPrompt ?? null,
  };
}

export async function sendGatewayPrompt(
  account: PairingAccount,
  workspacePath: string,
  sessionId: string,
  prompt: string,
): Promise<unknown> {
  return request(account, `/sessions/${encodeURIComponent(sessionId)}/prompts`, { workspacePath, prompt });
}

export async function cancelGatewaySession(
  account: PairingAccount,
  workspacePath: string,
  sessionId: string,
): Promise<void> {
  await request(account, `/sessions/${encodeURIComponent(sessionId)}/cancel`, { workspacePath });
}

export async function respondGatewayPrompt(
  account: PairingAccount,
  workspacePath: string,
  sessionId: string,
  prompt: GatewayPendingPrompt,
  response: Record<string, unknown>,
): Promise<unknown> {
  return request(account, "/prompts/respond", {
    workspacePath,
    sessionId,
    promptId: prompt.promptId,
    promptType: prompt.promptType,
    response,
  });
}
