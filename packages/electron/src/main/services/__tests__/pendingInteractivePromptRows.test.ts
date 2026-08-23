// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { findPendingInteractivePromptFromRows } from '../pendingInteractivePromptRows';

describe('findPendingInteractivePromptFromRows', () => {
  it('finds MCP AskUserQuestion choices inside a Claude assistant tool_use block', () => {
    const promptId = 'toolu_01XULFeUa7E3aLN8VSiGH63o';
    const prompt = findPendingInteractivePromptFromRows([
      {
        id: '395694',
        createdAt: 1_776_576_743_089,
        content: JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I need one decision.' },
              {
                type: 'tool_use',
                id: promptId,
                name: 'mcp__nimbalyst__AskUserQuestion',
                input: {
                  questions: [{
                    header: 'Execute Plan',
                    question: 'Lock Execute Plan during a scale cycle?',
                    multiSelect: false,
                    options: [
                      { label: 'Lock it too', description: 'Close the gap.' },
                      { label: 'Leave it live', description: 'Keep it available.' },
                    ],
                  }],
                },
              },
            ],
          },
        }),
      },
    ]);

    expect(prompt).toMatchObject({
      promptId,
      promptType: 'ask_user_question_request',
      content: {
        questions: [{
          header: 'Execute Plan',
          question: 'Lock Execute Plan during a scale cycle?',
          options: [
            { label: 'Lock it too', description: 'Close the gap.' },
            { label: 'Leave it live', description: 'Keep it available.' },
          ],
        }],
      },
    });
  });

  it('keeps a question pending when Claude backgrounds the still-running MCP call', () => {
    const promptId = 'toolu_ask_1';
    const prompt = findPendingInteractivePromptFromRows([
      {
        id: '1',
        createdAt: 100,
        content: JSON.stringify({
          type: 'assistant',
          message: {
            content: [{
              type: 'tool_use',
              id: promptId,
              name: 'mcp__nimbalyst__AskUserQuestion',
              input: {
                questions: [{
                  header: 'Choice',
                  question: 'Continue?',
                  options: [
                    { label: 'Yes', description: 'Continue.' },
                    { label: 'No', description: 'Stop.' },
                  ],
                }],
              },
            }],
          },
        }),
      },
      {
        id: '2',
        createdAt: 220,
        content: JSON.stringify({
          type: 'nimbalyst_tool_result',
          tool_use_id: promptId,
          result: 'MCP tool "nimbalyst/AskUserQuestion" is still running after 120s. It was moved to the background as task abc.',
          is_error: false,
        }),
      },
    ]);

    expect(prompt?.promptId).toBe(promptId);
  });

  it('removes the prompt after a real answer is persisted', () => {
    const promptId = 'toolu_ask_2';
    const prompt = findPendingInteractivePromptFromRows([
      {
        id: '1',
        createdAt: 100,
        content: JSON.stringify({
          type: 'nimbalyst_tool_use',
          id: promptId,
          name: 'AskUserQuestion',
          input: {
            questions: [{
              header: 'Choice',
              question: 'Continue?',
              options: [{ label: 'Yes', description: 'Continue.' }],
            }],
          },
        }),
      },
      {
        id: '2',
        createdAt: 200,
        content: JSON.stringify({
          type: 'ask_user_question_response',
          questionId: promptId,
          answers: { 'Continue?': 'Yes' },
        }),
      },
    ]);

    expect(prompt).toBeNull();
  });

  it('removes a synthetic Codex prompt after its raw exec call id is answered', () => {
    const rawPromptId = 'exec-d442f356-b888-46ee-8aab-411506066afb';
    const syntheticPromptId = `nimtc|${rawPromptId}|1787467444576|49`;
    const prompt = findPendingInteractivePromptFromRows([
      {
        id: '1',
        createdAt: 100,
        content: JSON.stringify({
          type: 'assistant',
          message: {
            content: [{
              type: 'tool_use',
              id: syntheticPromptId,
              name: 'mcp__nimbalyst__AskUserQuestion',
              input: {
                questions: [{
                  header: 'Choice',
                  question: 'Continue?',
                  options: [{ label: 'Yes', description: 'Continue.' }],
                }],
              },
            }],
          },
        }),
      },
      {
        id: '2',
        createdAt: 200,
        content: JSON.stringify({
          type: 'ask_user_question_response',
          questionId: rawPromptId,
          answers: { 'Continue?': 'Yes' },
        }),
      },
    ]);

    expect(prompt).toBeNull();
  });
});
