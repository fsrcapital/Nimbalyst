// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shouldConsumeTypeaheadEnter } from '../aiInputKeyboard';

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
});
