import { createHmac, timingSafeEqual } from 'crypto';

export const REMOTE_GATEWAY_PREFIX = '/remote/v1';
export const REMOTE_GATEWAY_ALLOWED_ORIGINS = new Set([
  'https://nimbalyst-command-center.fsrcapital.chatgpt.site',
  'http://localhost:3000',
]);

export interface RemoteGatewayWorkspace {
  path: string;
  name: string;
}

export interface RemoteGatewayDependencies {
  getToken(): string;
  listWorkspaces(): Promise<RemoteGatewayWorkspace[]>;
  listSessions(workspacePath: string): Promise<unknown[]>;
  listSessionCreationOptions(workspacePath: string): Promise<unknown>;
  createSession(
    workspacePath: string,
    input: {
      provider: 'claude-code' | 'openai-codex';
      model: string;
      prompt: string;
      title?: string;
      useWorktree: boolean;
    },
  ): Promise<unknown>;
  getSessionResult(workspacePath: string, sessionId: string): Promise<unknown>;
  getTranscript(workspacePath: string, sessionId: string): Promise<unknown>;
  sendPrompt(workspacePath: string, sessionId: string, prompt: string): Promise<unknown>;
  cancelSession(workspacePath: string, sessionId: string): Promise<unknown>;
  respondToPrompt(
    workspacePath: string,
    input: {
      sessionId: string;
      promptId: string;
      promptType: 'permission_request' | 'ask_user_question_request' | 'exit_plan_mode_request';
      response: Record<string, unknown>;
    },
  ): Promise<unknown>;
  updateWorkflow(
    workspacePath: string,
    sessionId: string,
    workflow: {
      myNotes?: string;
      nextAction?: string;
      waitingOn?: string;
      attentionReasons?: string[];
    },
  ): Promise<unknown>;
  getUsage(): Promise<unknown>;
  getWebPushPublicKey(): string;
  subscribeWebPush(input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    deviceLabel?: string;
  }): void;
  unsubscribeWebPush(endpoint: string): void;
}

export interface RemoteGatewayRequest {
  method: string;
  pathname: string;
  origin?: string;
  token?: string;
  body?: unknown;
}

export interface RemoteGatewayResponse {
  status: number;
  body: unknown;
}

const promptTypes = new Set([
  'permission_request',
  'ask_user_question_request',
  'exit_plan_mode_request',
]);

const attentionReasons = new Set([
  'user-input',
  'review',
  'manual-testing',
  'blocked',
  'agent-handoff',
]);

function error(status: number, message: string): RemoteGatewayResponse {
  return { status, body: { error: message } };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maxLength = 10_000): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label} is too long.`);
  return result;
}

function optionalText(value: unknown, label: string, maxLength = 20_000): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  if (value.length > maxLength) throw new Error(`${label} is too long.`);
  return value;
}

function constantTimeEquals(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  if (leftBytes.length !== rightBytes.length) {
    timingSafeEqual(leftBytes, leftBytes);
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function deriveRemoteGatewayToken(encryptionKeySeed: string): string {
  return createHmac('sha256', Buffer.from(encryptionKeySeed, 'base64'))
    .update('nimbalyst-remote-gateway-v1', 'utf8')
    .digest('hex');
}

export function isRemoteGatewayPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && (pathname === REMOTE_GATEWAY_PREFIX || pathname.startsWith(`${REMOTE_GATEWAY_PREFIX}/`));
}

export function isRemoteGatewayOriginAllowed(origin: string | undefined): boolean {
  return typeof origin === 'string' && REMOTE_GATEWAY_ALLOWED_ORIGINS.has(origin);
}

export function createRemoteGatewayRouter(deps: RemoteGatewayDependencies) {
  return async (request: RemoteGatewayRequest): Promise<RemoteGatewayResponse> => {
    if (!isRemoteGatewayOriginAllowed(request.origin)) {
      return error(403, 'This browser origin is not allowed to use the desktop gateway.');
    }
    if (request.method === 'OPTIONS') return { status: 204, body: null };
    if (!constantTimeEquals(request.token, deps.getToken())) {
      return error(401, 'The desktop pairing credential is invalid or has been revoked.');
    }

    try {
      const workspaces = await deps.listWorkspaces();
      if (request.method === 'GET' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/health`) {
        return { status: 200, body: { status: 'ok' } };
      }
      if (request.method === 'GET' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/workspaces`) {
        return { status: 200, body: { workspaces } };
      }

      if (request.method === 'GET' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/usage`) {
        return { status: 200, body: await deps.getUsage() };
      }

      if (request.method === 'GET' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/notifications/vapid-public-key`) {
        return { status: 200, body: { publicKey: deps.getWebPushPublicKey() } };
      }

      if (request.method === 'POST' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/notifications/subscribe`) {
        const subscriptionBody = record(request.body);
        const endpoint = requiredString(subscriptionBody.endpoint, 'endpoint', 8_192);
        const endpointUrl = new URL(endpoint);
        if (endpointUrl.protocol !== 'https:') throw new Error('endpoint must use HTTPS.');
        const keys = record(subscriptionBody.keys);
        deps.subscribeWebPush({
          endpoint,
          keys: {
            p256dh: requiredString(keys.p256dh, 'keys.p256dh', 4_096),
            auth: requiredString(keys.auth, 'keys.auth', 4_096),
          },
          deviceLabel: optionalText(subscriptionBody.deviceLabel, 'deviceLabel', 200),
        });
        return { status: 200, body: { success: true } };
      }

      if (request.method === 'POST' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/notifications/unsubscribe`) {
        const subscriptionBody = record(request.body);
        deps.unsubscribeWebPush(requiredString(subscriptionBody.endpoint, 'endpoint', 8_192));
        return { status: 200, body: { success: true } };
      }

      const body = record(request.body);
      const workspacePath = requiredString(body.workspacePath, 'workspacePath', 4_096);
      if (!workspaces.some((workspace) => workspace.path === workspacePath)) {
        return error(403, 'This workspace is not enabled for mobile access.');
      }

      if (request.method === 'POST' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/sessions/list`) {
        return { status: 200, body: { sessions: await deps.listSessions(workspacePath) } };
      }

      if (request.method === 'POST' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/session-options`) {
        return { status: 200, body: await deps.listSessionCreationOptions(workspacePath) };
      }

      if (request.method === 'POST' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/sessions/create`) {
        const provider = requiredString(body.provider, 'provider', 100);
        if (provider !== 'claude-code' && provider !== 'openai-codex') {
          throw new Error('provider must be Claude Agent or OpenAI Codex.');
        }
        if (body.useWorktree !== undefined && typeof body.useWorktree !== 'boolean') {
          throw new Error('useWorktree must be true or false.');
        }
        return {
          status: 200,
          body: await deps.createSession(workspacePath, {
            provider,
            model: requiredString(body.model, 'model', 500),
            prompt: requiredString(body.prompt, 'prompt', 50_000),
            title: optionalText(body.title, 'title', 200)?.trim() || undefined,
            useWorktree: body.useWorktree === true,
          }),
        };
      }

      const sessionRoute = request.pathname.match(/^\/remote\/v1\/sessions\/([^/]+)\/(result|transcript|prompts|workflow|cancel)$/);
      if (request.method === 'POST' && sessionRoute) {
        const sessionId = decodeURIComponent(sessionRoute[1]);
        if (sessionRoute[2] === 'result') {
          return { status: 200, body: await deps.getSessionResult(workspacePath, sessionId) };
        }
        if (sessionRoute[2] === 'transcript') {
          return { status: 200, body: await deps.getTranscript(workspacePath, sessionId) };
        }
        if (sessionRoute[2] === 'prompts') {
          const prompt = requiredString(body.prompt, 'prompt', 50_000);
          return { status: 200, body: await deps.sendPrompt(workspacePath, sessionId, prompt) };
        }
        if (sessionRoute[2] === 'cancel') {
          return { status: 200, body: await deps.cancelSession(workspacePath, sessionId) };
        }

        const reasons = body.attentionReasons;
        if (reasons !== undefined && (!Array.isArray(reasons) || reasons.some((reason) => typeof reason !== 'string' || !attentionReasons.has(reason)))) {
          throw new Error('attentionReasons contains an unsupported value.');
        }
        return {
          status: 200,
          body: await deps.updateWorkflow(workspacePath, sessionId, {
            myNotes: optionalText(body.myNotes, 'myNotes'),
            nextAction: optionalText(body.nextAction, 'nextAction'),
            waitingOn: optionalText(body.waitingOn, 'waitingOn'),
            attentionReasons: reasons as string[] | undefined,
          }),
        };
      }

      if (request.method === 'POST' && request.pathname === `${REMOTE_GATEWAY_PREFIX}/prompts/respond`) {
        const promptType = requiredString(body.promptType, 'promptType');
        if (!promptTypes.has(promptType)) throw new Error('promptType is not supported.');
        return {
          status: 200,
          body: await deps.respondToPrompt(workspacePath, {
            sessionId: requiredString(body.sessionId, 'sessionId'),
            promptId: requiredString(body.promptId, 'promptId'),
            promptType: promptType as 'permission_request' | 'ask_user_question_request' | 'exit_plan_mode_request',
            response: record(body.response),
          }),
        };
      }

      return error(404, 'Remote gateway route not found.');
    } catch (caught) {
      console.error('[RemoteGateway] Request failed', caught);
      return error(400, caught instanceof Error ? caught.message : 'The remote gateway request was invalid.');
    }
  };
}
