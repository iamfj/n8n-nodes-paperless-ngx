/**
 * Value carried by the "more than N entries" notice a truncated dropdown appends.
 * n8n has no inert option — the notice is selectable — so it needs a value that
 * no execute path can mistake for a real one. `''` cannot be used: on Document →
 * Update that is exactly how a deliberate "clear the Correspondent" arrives.
 */
export const TRUNCATED_OPTION_VALUE = '__truncated__';

/** False for a field left absent and for the truncation notice, which means neither. */
export function isChosen(raw: unknown): boolean {
	return raw !== undefined && raw !== TRUNCATED_OPTION_VALUE;
}
