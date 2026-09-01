/**
 * Build the user-visible continuation sent to a Claude CLI session when an
 * AskUserQuestion waiter was lost during an app restart.
 *
 * The CLI owns the conversation in its own process. Once the MCP request that
 * was waiting for the answer is gone, the only safe recovery rail is a new
 * user turn after the stranded CLI turn is interrupted. Keep the marker
 * explicit so Claude understands that this is the answer to the earlier
 * question, rather than treating it as unrelated feedback.
 */
export function buildClaudeCliAskUserQuestionRecoveryPrompt(
  answers: Record<string, string>,
): string {
  const answerLines = Object.entries(answers)
    .map(([question, answer]) => `${question}: ${answer}`)
    .join('\n');

  return [
    '[Nimbalyst recovered an answer to the previous AskUserQuestion after a restart]',
    '',
    answerLines || '(The user cancelled the question.)',
    '',
    'Continue the interrupted task using this answer. Do not ask the same question again.',
  ].join('\n');
}
