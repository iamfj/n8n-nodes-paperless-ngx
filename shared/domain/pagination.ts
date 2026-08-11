export type PageRequest = { page?: number; pageSize?: number };

/** DRF's `StandardPagination` envelope. `all` is v9-only. */
export type DrfPage<T> = {
	count: number;
	next: string | null;
	previous: string | null;
	all?: number[];
	results: T[];
};

// `next` is deliberately not carried over. DRF builds it as an absolute URI from
// the host it believes it is served on, which behind a misconfigured reverse
// proxy is something like http://localhost:8000/ -- unreachable from n8n, and an
// authenticated request waiting to be sent to an unintended origin. Callers get
// a boolean and page against our own base URL instead.
export type Page<T> = { items: T[]; count: number; hasMore: boolean };

export function toPage<T>(raw: DrfPage<T>): Page<T> {
	return {
		items: raw.results,
		count: raw.count,
		hasMore: typeof raw.next === 'string' && raw.next.length > 0,
	};
}

export function isDrfPage(value: unknown): value is DrfPage<unknown> {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<DrfPage<unknown>>;
	return typeof candidate.count === 'number' && Array.isArray(candidate.results);
}

export function pageQuery(request: PageRequest): { page?: number; page_size?: number } {
	const query: { page?: number; page_size?: number } = {};
	if (request.page !== undefined) {
		query.page = request.page;
	}
	if (request.pageSize !== undefined) {
		query.page_size = request.pageSize;
	}
	return query;
}
