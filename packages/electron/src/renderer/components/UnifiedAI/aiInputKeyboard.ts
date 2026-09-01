/**
 * Enter should be consumed by autocomplete only when there is a concrete
 * option ready to select. During the brief render between the options arriving
 * and GenericTypeahead reporting its selected option, Enter must remain a send
 * key rather than becoming a no-op.
 */
export function shouldConsumeTypeaheadEnter(
  hasTypeaheadMatch: boolean,
  optionCount: number,
  hasSelectedOption: boolean,
): boolean {
  return hasTypeaheadMatch && optionCount > 0 && hasSelectedOption;
}
