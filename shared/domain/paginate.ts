import type { Page } from './pagination';

export type PageFetcher<T> = (page: number) => Promise<Page<T>>;

/**
 * Pages by incrementing a number, never by following the response's `next` URL --
 * see the note on `Page` for why that URL is not to be trusted.
 */
export async function* paginate<T>(
	fetch: PageFetcher<T>,
	startPage = 1,
): AsyncGenerator<T, void, undefined> {
	let page = startPage;
	for (;;) {
		const { items, hasMore } = await fetch(page);
		for (const item of items) {
			yield item;
		}
		// An empty page also terminates: a server that keeps reporting `hasMore`
		// while returning nothing would otherwise loop forever.
		if (!hasMore || items.length === 0) {
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
