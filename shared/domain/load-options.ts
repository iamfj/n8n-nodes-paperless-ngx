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

/**
 * The IDs a multi-select carries, or `undefined` when nothing was chosen. A
 * selection of nothing but the truncation notice is not an empty selection:
 * dropping the notice alone would leave `[]`, which clears a document's tags on
 * Update and widens a Get Many filter to the whole archive.
 */
export function chosenIds(raw: unknown): number[] | undefined {
	if (!Array.isArray(raw)) {
		return undefined;
	}
	const chosen = raw.filter((entry) => isChosen(entry));
	if (chosen.length === 0 && raw.length > 0) {
		return undefined;
	}
	return chosen.map(Number).filter(Number.isInteger);
}
