import type { Page } from './pagination';

export type PageFetcher<T> = (page: number) => Promise<Page<T>>;

/** Last-resort stop for a server whose `count` is as wrong as its `hasMore`. */
const MAX_PAGES = 1000;

/**
 * Pages by incrementing a number, never by following the response's `next` URL --
 * see the note on `Page` for why that URL is not to be trusted.
 */
export async function* paginate<T>(
	fetch: PageFetcher<T>,
	startPage = 1,
): AsyncGenerator<T, void, undefined> {
	let page = startPage;
	let seen = 0;
	for (let request = 0; request < MAX_PAGES; request++) {
		const { items, count, hasMore } = await fetch(page);
		for (const item of items) {
			yield item;
		}
		seen += items.length;
		// `hasMore` alone is not a termination guarantee: a proxy replaying a
		// cached page, or a filter DRF re-evaluates per request, keeps it true
		// forever. An empty page and the server's own `count` both bound the walk.
		if (!hasMore || items.length === 0 || seen >= count) {
			return;
		}
		page += 1;
	}
}

export async function collect<T>(source: AsyncIterable<T>, limit?: number): Promise<T[]> {
	const items: T[] = [];
	if (limit !== undefined && limit <= 0) {
		return items;
	}
	for await (const item of source) {
		items.push(item);
		if (limit !== undefined && items.length >= limit) {
			break;
		}
	}
	return items;
}
