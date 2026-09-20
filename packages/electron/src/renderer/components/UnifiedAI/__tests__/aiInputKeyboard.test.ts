// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hasSendableAIInput, shouldConsumeTypeaheadEnter } from '../aiInputKeyboard';

describe('AI input Enter handling', () => {
  it('does not consume Enter while autocomplete has no selected option yet', () => {
    expect(shouldConsumeTypeaheadEnter(true, 3, false)).toBe(false);
  });

  it('consumes Enter when autocomplete has a selectable option', () => {
    expect(shouldConsumeTypeaheadEnter(true, 3, true)).toBe(true);
  });

  it('does not consume Enter when there is no visible autocomplete result', () => {
    expect(shouldConsumeTypeaheadEnter(false, 0, false)).toBe(false);
    expect(shouldConsumeTypeaheadEnter(true, 0, false)).toBe(false);
  });

  it('treats an attachment-only draft as sendable', () => {
    expect(hasSendableAIInput('', 1)).toBe(true);
    expect(hasSendableAIInput('  ', 2)).toBe(true);
    expect(hasSendableAIInput('', 0)).toBe(false);
    expect(hasSendableAIInput('look at this', 0)).toBe(true);
  });
});
