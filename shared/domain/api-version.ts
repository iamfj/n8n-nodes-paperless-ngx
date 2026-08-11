export type ApiVersion = 9 | 10;

/** What the credential offers: an explicit pin, or optimistic negotiation. */
export type ApiVersionSetting = 'auto' | ApiVersion;

/** Descending, so the first entry is always the one to try first. */
export const SUPPORTED_API_VERSIONS: readonly ApiVersion[] = [10, 9];

export const PREFERRED_API_VERSION: ApiVersion = SUPPORTED_API_VERSIONS[0];

export function acceptHeader(version: ApiVersion): string {
	return `application/json; version=${version}`;
}

export function parseApiVersionHeader(raw: unknown): number | undefined {
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value === 'number') {
		return Number.isInteger(value) ? value : undefined;
	}
	if (typeof value !== 'string') {
		return undefined;
	}
	const parsed = Number.parseInt(value.trim(), 10);
	return Number.isNaN(parsed) ? undefined : parsed;
}

export function isSupported(version: number): version is ApiVersion {
	return SUPPORTED_API_VERSIONS.includes(version as ApiVersion);
}

export type Capability =
	| 'individualDocumentEditEndpoints'
	| 'titleSearch'
	| 'bulkEditObjectFilters'
	| 'redesignedTasks'
	| 'savedViewDisplayFlags';

// Listed as the versions that have the capability rather than a minimum version:
// `savedViewDisplayFlags` is the case a minimum cannot express, since v10 moved
// the flags off the saved view and the older version is the one that has them.
const CAPABILITY_VERSIONS: Record<Capability, readonly ApiVersion[]> = {
	individualDocumentEditEndpoints: [10],
	titleSearch: [10],
	bulkEditObjectFilters: [10],
	redesignedTasks: [10],
	savedViewDisplayFlags: [9],
};

export function supports(version: ApiVersion, capability: Capability): boolean {
	return CAPABILITY_VERSIONS[capability].includes(version);
}
