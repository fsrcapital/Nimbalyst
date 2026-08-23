import { getCodexToolLookupAliases } from '@nimbalyst/runtime/ai/server/toolLookupIds';

export type PendingInteractivePromptType =
  | 'permission_request'
  | 'ask_user_question_request'
  | 'exit_plan_mode_request';

export interface PendingInteractivePromptRow {
  id: string;
  content: string;
  createdAt: number;
}

export interface ParsedPendingInteractivePrompt {
  id: string;
  promptId: string;
  promptType: PendingInteractivePromptType;
  createdAt: number;
  content: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function normalizedToolName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const parts = value.split('__');
  return parts.length >= 3 && parts[0] === 'mcp'
    ? parts.slice(2).join('__')
    : value;
}

function isBackgroundedRunningResult(value: unknown): boolean {
  return typeof value === 'string'
    && value.includes('is still running after')
    && value.includes('moved to the background');
}

function deletePendingPromptByAlias(
  pending: Map<string, ParsedPendingInteractivePrompt>,
  settledPromptId: string,
): void {
  const settledAliases = new Set(getCodexToolLookupAliases(settledPromptId));
  for (const pendingPromptId of pending.keys()) {
    if (getCodexToolLookupAliases(pendingPromptId).some((alias) => settledAliases.has(alias))) {
      pending.delete(pendingPromptId);
    }
  }
}

function askUserQuestionCandidates(
  row: PendingInteractivePromptRow,
  parsed: Record<string, any>,
): ParsedPendingInteractivePrompt[] {
  const candidates: ParsedPendingInteractivePrompt[] = [];
  const addCandidate = (toolUse: Record<string, any>) => {
    if (normalizedToolName(toolUse.name) !== 'AskUserQuestion') return;
    const promptId = typeof toolUse.id === 'string' ? toolUse.id : '';
    const input = asRecord(toolUse.input);
    const questions = Array.isArray(input?.questions) ? input.questions : [];
    if (!promptId || questions.length === 0) return;
    candidates.push({
      id: row.id,
      promptId,
      promptType: 'ask_user_question_request',
      createdAt: row.createdAt,
      content: {
        ...toolUse,
        questions,
        questionId: promptId,
      },
    });
  };

  if (parsed.type === 'nimbalyst_tool_use') {
    addCandidate(parsed);
  }

  if (parsed.type === 'assistant') {
    const message = asRecord(parsed.message);
    const blocks = Array.isArray(message?.content) ? message.content : [];
    for (const block of blocks) {
      const record = asRecord(block);
      if (record?.type === 'tool_use') addCandidate(record);
    }
  }

  return candidates;
}

/**
 * Reconstruct the oldest unanswered AskUserQuestion from raw transcript rows.
 * Claude CLI persists MCP calls inside its ordinary assistant message, while
 * other providers may persist the older synthetic nimbalyst_tool_use row.
 */
export function findPendingInteractivePromptFromRows(
  rows: PendingInteractivePromptRow[],
): ParsedPendingInteractivePrompt | null {
  const pending = new Map<string, ParsedPendingInteractivePrompt>();

  for (const row of rows) {
    let parsed: Record<string, any>;
    try {
      const candidate = asRecord(JSON.parse(row.content));
      if (!candidate) continue;
      parsed = candidate;
    } catch {
      continue;
    }

    for (const prompt of askUserQuestionCandidates(row, parsed)) {
      pending.set(prompt.promptId, prompt);
    }

    if (parsed.type === 'ask_user_question_response' && typeof parsed.questionId === 'string') {
      deletePendingPromptByAlias(pending, parsed.questionId);
    }
    if (
      parsed.type === 'nimbalyst_tool_result'
      && typeof parsed.tool_use_id === 'string'
      && !isBackgroundedRunningResult(parsed.result)
    ) {
      deletePendingPromptByAlias(pending, parsed.tool_use_id);
    }
  }

  return pending.values().next().value ?? null;
}
