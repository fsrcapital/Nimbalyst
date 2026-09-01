import { describe, expect, it } from 'vitest';
import { buildClaudeCliAskUserQuestionRecoveryPrompt } from '../claudeCliAskUserQuestionRecovery';

describe('buildClaudeCliAskUserQuestionRecoveryPrompt', () => {
  it('labels recovered answers as the response to the interrupted question', () => {
    expect(buildClaudeCliAskUserQuestionRecoveryPrompt({
      'Which database should we use?': 'Postgres',
      'Should I continue?': 'Yes',
    })).toBe(
      '[Nimbalyst recovered an answer to the previous AskUserQuestion after a restart]\n\n'
      + 'Which database should we use?: Postgres\nShould I continue?: Yes\n\n'
      + 'Continue the interrupted task using this answer. Do not ask the same question again.',
    );
  });

  it('preserves cancellation as a recoverable instruction', () => {
    expect(buildClaudeCliAskUserQuestionRecoveryPrompt({})).toContain(
      '(The user cancelled the question.)',
    );
  });
});
