/** Discover and normalize Codex CLI rollout histories from CODEX_HOME/sessions. */

import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';
import { createInterface } from 'readline';
import { logger } from '../utils/logger';

const log = logger.aiSession;

export interface CodexImportMessage {
  direction: 'input' | 'output';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CodexSessionMetadata {
  sessionId: string;
  workspacePath: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Null during discovery; the full count is calculated only when imported. */
  messageCount: number | null;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model?: string;
  filePath: string;
  fileSizeBytes?: number;
}

interface ParsedRollout {
  metadata: CodexSessionMetadata;
  messages: CodexImportMessage[];
}

interface PendingToolCall {
  id: string;
  callId: string;
  name: string;
  arguments: unknown;
  timestamp: Date;
  turnId?: string;
}

function codexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex');
}

function timestamp(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const record = block as Record<string, unknown>;
      return typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return { input: value };
  }
}

function toolResult(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? '';
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function importedEnvelope(
  sessionId: string,
  turnId: string | undefined,
  item: Record<string, unknown>,
): string {
  return JSON.stringify({
    method: 'item/completed',
    params: { threadId: sessionId, ...(turnId ? { turnId } : {}), item },
  });
}

function normalizedWorkspace(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/, 1)[0].trim();
  if (!firstLine) return 'Imported Codex Session';
  return firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine;
}

export async function parseCodexRollout(filePath: string): Promise<ParsedRollout | null> {
  let sessionId = '';
  let workspacePath = '';
  let model: string | undefined;
  let currentTurnId: string | undefined;
  let firstSeen: Date | null = null;
  let lastSeen: Date | null = null;
  let firstPrompt = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const messages: CodexImportMessage[] = [];
  const pendingTools = new Map<string, PendingToolCall>();

  const lines = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const createdAt = timestamp(row.timestamp);
    if (createdAt) {
      firstSeen ??= createdAt;
      lastSeen = createdAt;
    }
    const payload = row.payload && typeof row.payload === 'object'
      ? row.payload as Record<string, unknown>
      : {};

    if (row.type === 'session_meta') {
      sessionId = typeof payload.id === 'string'
        ? payload.id
        : typeof payload.session_id === 'string' ? payload.session_id : sessionId;
      workspacePath = typeof payload.cwd === 'string' ? payload.cwd : workspacePath;
      continue;
    }
    if (row.type === 'turn_context') {
      currentTurnId = typeof payload.turn_id === 'string' ? payload.turn_id : currentTurnId;
      workspacePath = typeof payload.cwd === 'string' ? payload.cwd : workspacePath;
      model = typeof payload.model === 'string' ? payload.model : model;
      continue;
    }
    if (!createdAt) continue;

    if (row.type === 'event_msg' && payload.type === 'user_message') {
      const prompt = typeof payload.message === 'string' ? payload.message : '';
      if (!prompt.trim()) continue;
      firstPrompt ||= prompt;
      messages.push({
        direction: 'input',
        content: JSON.stringify({ prompt }),
        metadata: { transport: 'app-server', imported: true, mode: 'agent' },
        createdAt,
      });
      continue;
    }

    if (row.type === 'event_msg' && payload.type === 'token_count') {
      const info = payload.info && typeof payload.info === 'object'
        ? payload.info as Record<string, unknown>
        : {};
      const usage = info.total_token_usage && typeof info.total_token_usage === 'object'
        ? info.total_token_usage as Record<string, unknown>
        : info;
      inputTokens = Math.max(inputTokens, Number(usage.input_tokens ?? 0) || 0);
      outputTokens = Math.max(outputTokens, Number(usage.output_tokens ?? 0) || 0);
      continue;
    }

    if (row.type !== 'response_item') continue;
    if (payload.type === 'message' && payload.role === 'assistant') {
      const text = textFromContent(payload.content);
      if (!text.trim()) continue;
      messages.push({
        direction: 'output',
        content: importedEnvelope(sessionId, currentTurnId, {
          id: typeof payload.id === 'string' ? payload.id : `agent-${createdAt.getTime()}`,
          type: 'agentMessage',
          status: 'completed',
          text,
        }),
        metadata: { transport: 'app-server', imported: true, eventType: 'item/completed' },
        createdAt,
      });
      continue;
    }
    if (payload.type === 'reasoning') {
      const reasoning = textFromContent(payload.summary);
      if (!reasoning.trim()) continue;
      messages.push({
        direction: 'output',
        content: importedEnvelope(sessionId, currentTurnId, {
          id: typeof payload.id === 'string' ? payload.id : `reasoning-${createdAt.getTime()}`,
          type: 'reasoning',
          status: 'completed',
          text: reasoning,
        }),
        metadata: { transport: 'app-server', imported: true, eventType: 'item/completed' },
        createdAt,
      });
      continue;
    }
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      const callId = typeof payload.call_id === 'string'
        ? payload.call_id
        : typeof payload.id === 'string' ? payload.id : `call-${createdAt.getTime()}`;
      pendingTools.set(callId, {
        id: typeof payload.id === 'string' ? payload.id : callId,
        callId,
        name: typeof payload.name === 'string' ? payload.name : 'tool',
        arguments: parseArguments(payload.arguments ?? payload.input),
        timestamp: createdAt,
        turnId: currentTurnId,
      });
      continue;
    }
    if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      const callId = typeof payload.call_id === 'string' ? payload.call_id : '';
      const call = pendingTools.get(callId);
      if (!call) continue;
      pendingTools.delete(callId);
      messages.push({
        direction: 'output',
        content: importedEnvelope(sessionId, call.turnId, {
          id: call.id,
          type: call.name,
          status: 'completed',
          arguments: call.arguments,
          result: toolResult(payload.output),
        }),
        metadata: { transport: 'app-server', imported: true, eventType: 'item/completed' },
        createdAt,
      });
    }
  }

  if (!sessionId || !workspacePath || !firstSeen || !lastSeen) return null;
  messages.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  return {
    metadata: {
      sessionId,
      workspacePath,
      title: titleFromPrompt(firstPrompt),
      createdAt: firstSeen.getTime(),
      updatedAt: lastSeen.getTime(),
      messageCount: messages.length,
      tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      model,
      filePath,
    },
    messages,
  };
}

async function findRollouts(directory: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Array<import('fs').Dirent>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findRollouts(fullPath));
    else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) files.push(fullPath);
  }
  return files;
}

const MAX_DISCOVERY_BYTES = 2 * 1024 * 1024;

/**
 * Read only the beginning of a rollout while populating the import picker.
 * Codex histories can be hundreds of megabytes; full parsing belongs in the
 * explicit import path, not in modal discovery.
 */
export async function scanCodexRolloutMetadata(
  filePath: string,
  expectedWorkspace?: string | null,
): Promise<CodexSessionMetadata | null> {
  let sessionId = '';
  let workspacePath = '';
  let model: string | undefined;
  let firstPrompt = '';
  let firstSeen: Date | null = null;
  const expected = expectedWorkspace ? normalizedWorkspace(expectedWorkspace) : null;

  const input = createReadStream(filePath, {
    encoding: 'utf8',
    start: 0,
    end: MAX_DISCOVERY_BYTES - 1,
  });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    firstSeen ??= timestamp(row.timestamp);
    const payload = asRecord(row.payload) ?? {};

    if (row.type === 'session_meta') {
      sessionId = typeof payload.id === 'string'
        ? payload.id
        : typeof payload.session_id === 'string' ? payload.session_id : sessionId;
      workspacePath = typeof payload.cwd === 'string' ? payload.cwd : workspacePath;
      if (expected && workspacePath && normalizedWorkspace(workspacePath) !== expected) return null;
    } else if (row.type === 'turn_context') {
      workspacePath = typeof payload.cwd === 'string' ? payload.cwd : workspacePath;
      model = typeof payload.model === 'string' ? payload.model : model;
      if (expected && workspacePath && normalizedWorkspace(workspacePath) !== expected) return null;
    } else if (row.type === 'event_msg' && payload.type === 'user_message') {
      const prompt = typeof payload.message === 'string' ? payload.message : '';
      if (prompt.trim()) firstPrompt ||= prompt;
    }

    if (sessionId && workspacePath && firstSeen && firstPrompt && model) break;
  }

  if (!sessionId || !workspacePath || !firstSeen) return null;
  if (expected && normalizedWorkspace(workspacePath) !== expected) return null;
  const stats = await fs.stat(filePath);
  return {
    sessionId,
    workspacePath,
    title: titleFromPrompt(firstPrompt),
    createdAt: firstSeen.getTime(),
    updatedAt: stats.mtimeMs,
    messageCount: null,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    model,
    filePath,
    fileSizeBytes: stats.size,
  };
}

export async function scanCodexSessions(options: {
  codexHome?: string;
  workspacePath?: string;
} = {}): Promise<CodexSessionMetadata[]> {
  const files = await findRollouts(path.join(options.codexHome ?? codexHome(), 'sessions'));
  const expectedWorkspace = options.workspacePath ? normalizedWorkspace(options.workspacePath) : null;
  const sessions: CodexSessionMetadata[] = [];
  for (const filePath of files) {
    try {
      const metadata = await scanCodexRolloutMetadata(filePath, expectedWorkspace);
      if (metadata) sessions.push(metadata);
    } catch (error) {
      log.warn(`[CodexSessionScanner] Failed to scan ${filePath}:`, error);
    }
  }
  return sessions.sort((left, right) => right.updatedAt - left.updatedAt);
}
