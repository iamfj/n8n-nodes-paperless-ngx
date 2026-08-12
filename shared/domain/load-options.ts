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
 * selection that yields no usable ID — the truncation notice, a name an
 * expression failed to resolve — is not an empty selection: returning `[]` would
 * clear a document's tags on Update and widen a Get Many filter to the whole
 * archive. Only a genuinely empty selection means `[]`.
 */
export function chosenIds(raw: unknown): number[] | undefined {
	if (!Array.isArray(raw)) {
		return undefined;
	}
	const ids = raw
		.filter((entry) => isChosen(entry))
		.map((entry) => Number(entry))
		// `> 0` and not just an integer: `Number('')` and `Number(null)` are `0`,
		// which no Paperless object ever has.
		.filter((id) => Number.isInteger(id) && id > 0);
	if (ids.length === 0 && raw.length > 0) {
		return undefined;
	}
	return ids;
}
