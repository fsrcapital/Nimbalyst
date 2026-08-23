import type { TranscriptViewMessage } from '@nimbalyst/runtime/ai/server/types';

export type RemoteTranscriptKind = 'user' | 'assistant' | 'system' | 'tool' | 'interactive';

export interface RemoteTranscriptMessage {
  id: string;
  sequence: number;
  createdAt: number;
  kind: RemoteTranscriptKind;
  label: string;
  text: string;
  status?: string;
  isError?: boolean;
}

export interface RemoteTranscriptPayload {
  messages: RemoteTranscriptMessage[];
  cursor: number;
  truncated: boolean;
  pendingPrompt?: RemotePendingPrompt | null;
}

export type RemotePendingPrompt =
  | {
      promptId: string;
      promptType: 'permission_request';
      createdAt: number;
      toolName: string;
      command: string;
      isDestructive: boolean;
      warnings: string[];
    }
  | {
      promptId: string;
      promptType: 'ask_user_question_request';
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
      promptType: 'exit_plan_mode_request';
      createdAt: number;
      planFilePath?: string;
    };

const MAX_MESSAGES = 120;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOTAL_CHARS = 120_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function shortText(value: unknown, maxLength = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function serializeRemotePendingPrompt(value: unknown): RemotePendingPrompt | null {
  const prompt = asRecord(value);
  const content = asRecord(prompt?.content);
  const promptId = shortText(prompt?.promptId, 500);
  const promptType = prompt?.promptType;
  const createdAt = typeof prompt?.createdAt === 'number' && Number.isFinite(prompt.createdAt)
    ? prompt.createdAt
    : 0;
  if (!promptId || !content) return null;

  if (promptType === 'permission_request') {
    const warnings = Array.isArray(content.warnings)
      ? content.warnings.slice(0, 10).map((warning) => shortText(warning, 500)).filter(Boolean)
      : [];
    return {
      promptId,
      promptType,
      createdAt,
      toolName: shortText(content.toolName, 200) || 'Tool',
      command: shortText(content.rawCommand, 4_000),
      isDestructive: content.isDestructive === true,
      warnings,
    };
  }

  if (promptType === 'ask_user_question_request') {
    const questions = Array.isArray(content.questions)
      ? content.questions.slice(0, 3).flatMap((candidate) => {
          const question = asRecord(candidate);
          const questionText = shortText(question?.question, 2_000);
          if (!questionText) return [];
          const options = Array.isArray(question?.options)
            ? question.options.slice(0, 10).flatMap((candidateOption) => {
                const option = asRecord(candidateOption);
                const label = shortText(option?.label, 500);
                return label ? [{ label, description: shortText(option?.description, 1_000) }] : [];
              })
            : [];
          return [{
            question: questionText,
            header: shortText(question?.header, 200),
            options,
            multiSelect: question?.multiSelect === true,
          }];
        })
      : [];
    return questions.length > 0 ? { promptId, promptType, createdAt, questions } : null;
  }

  if (promptType === 'exit_plan_mode_request') {
    const planFilePath = shortText(content.planFilePath, 4_000);
    return { promptId, promptType, createdAt, ...(planFilePath ? { planFilePath } : {}) };
  }

  return null;
}

function boundedText(value: unknown): { text: string; truncated: boolean } {
  if (typeof value !== 'string') return { text: '', truncated: false };
  const text = value.trim();
  if (text.length <= MAX_MESSAGE_CHARS) return { text, truncated: false };
  return { text: `${text.slice(0, MAX_MESSAGE_CHARS)}\n…`, truncated: true };
}

function timestamp(value: Date): number {
  const result = value instanceof Date ? value.getTime() : Number.NaN;
  return Number.isFinite(result) ? result : 0;
}

function serializeMessage(message: TranscriptViewMessage): { message?: RemoteTranscriptMessage; truncated: boolean } {
  const base = {
    id: String(message.id),
    sequence: message.sequence,
    createdAt: timestamp(message.createdAt),
  };

  if (message.type === 'user_message') {
    const content = boundedText(message.text);
    return { message: { ...base, kind: 'user', label: 'You', text: content.text }, truncated: content.truncated };
  }
  if (message.type === 'assistant_message') {
    const content = boundedText(message.text);
    return {
      message: { ...base, kind: 'assistant', label: message.model ?? 'Agent', text: content.text, isError: message.isError },
      truncated: content.truncated,
    };
  }
  if (message.type === 'system_message') {
    const content = boundedText(message.text);
    return {
      message: { ...base, kind: 'system', label: 'Nimbalyst', text: content.text, isError: message.isError },
      truncated: content.truncated,
    };
  }
  if (message.type === 'tool_call' && message.toolCall) {
    const content = boundedText(message.toolCall.description ?? '');
    return {
      message: {
        ...base,
        kind: 'tool',
        label: message.toolCall.toolDisplayName || message.toolCall.toolName || 'Tool',
        text: content.text,
        status: message.toolCall.status,
        isError: message.toolCall.isError || message.toolCall.status === 'error',
      },
      truncated: content.truncated,
    };
  }
  if (message.type === 'interactive_prompt' && message.interactivePrompt) {
    const prompt = message.interactivePrompt;
    let text = 'Your response is required on the desktop.';
    if (prompt.promptType === 'permission_request') {
      text = `${prompt.toolName || 'A tool'} is requesting permission.`;
    } else if (prompt.promptType === 'ask_user_question') {
      text = prompt.questions.map((question) => question.question).filter(Boolean).join('\n');
    } else if (prompt.promptType === 'git_commit_proposal') {
      text = `Commit proposal: ${prompt.commitMessage}`;
    }
    const content = boundedText(text);
    return {
      message: { ...base, kind: 'interactive', label: 'Needs your input', text: content.text, status: prompt.status },
      truncated: content.truncated,
    };
  }
  if (message.type === 'subagent' && message.subagent) {
    return {
      message: {
        ...base,
        kind: 'tool',
        label: `Subagent: ${message.subagent.agentType}`,
        text: '',
        status: message.subagent.status,
      },
      truncated: false,
    };
  }
  return { truncated: false };
}

export function serializeRemoteTranscript(messages: TranscriptViewMessage[]): RemoteTranscriptPayload {
  let truncated = false;
  const serialized = messages.flatMap((message) => {
    const result = serializeMessage(message);
    truncated ||= result.truncated;
    return result.message ? [result.message] : [];
  });

  const candidates = serialized.slice(-MAX_MESSAGES);
  truncated ||= candidates.length < serialized.length;
  const retained: RemoteTranscriptMessage[] = [];
  let totalChars = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index];
    if (retained.length > 0 && totalChars + message.text.length > MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }
    retained.push(message);
    totalChars += message.text.length;
  }
  retained.reverse();

  return {
    messages: retained,
    cursor: serialized.at(-1)?.sequence ?? 0,
    truncated,
  };
}
