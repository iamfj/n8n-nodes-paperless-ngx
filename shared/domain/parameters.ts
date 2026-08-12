/**
 * The value a boolean node parameter carries, or `undefined` when it carries
 * nothing usable. A toggle filled by an expression or by an AI agent arrives as
 * `'false'`, which is a truthy string, so `as boolean` is not enough.
 */
export function optionalBoolean(raw: unknown): boolean | undefined {
	if (typeof raw === 'boolean') {
		return raw;
	}
	return raw === 'true' ? true : raw === 'false' ? false : undefined;
}

/** The same read where the parameter has a default rather than an absent state. */
export function toBoolean(raw: unknown, fallback: boolean): boolean {
	return optionalBoolean(raw) ?? fallback;
}
