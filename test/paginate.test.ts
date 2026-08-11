import { collect, paginate } from '../shared/domain/paginate';
import type { Page } from '../shared/domain/pagination';

/** Three pages of two items, ending naturally. */
function pagesOf(total: number, pageSize = 2) {
	return vi.fn(async (page: number): Promise<Page<number>> => {
		const start = (page - 1) * pageSize;
		const items = Array.from(
			{ length: Math.min(pageSize, Math.max(total - start, 0)) },
			(_, i) => start + i,
		);
		return { items, count: total, hasMore: start + items.length < total };
	});
}

describe('paginate', () => {
	it('walks every page and stops when the server says there is no more', async () => {
		const fetch = pagesOf(5);
		expect(await collect(paginate(fetch))).toEqual([0, 1, 2, 3, 4]);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('asks for incrementing page numbers and never for a URL', async () => {
		const fetch = pagesOf(5);
		await collect(paginate(fetch));
		expect(fetch.mock.calls).toEqual([[1], [2], [3]]);
		for (const [argument] of fetch.mock.calls) {
			expect(typeof argument).toBe('number');
		}
	});

	it('starts at the requested page', async () => {
		const fetch = pagesOf(6);
		expect(await collect(paginate(fetch, 2))).toEqual([2, 3, 4, 5]);
		expect(fetch.mock.calls).toEqual([[2], [3]]);
	});

	it('terminates on an empty page even if the server still claims more', async () => {
		const fetch = vi.fn(
			async (): Promise<Page<number>> => ({ items: [], count: 9, hasMore: true }),
		);
		expect(await collect(paginate(fetch))).toEqual([]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('stops fetching once the limit is reached', async () => {
		const fetch = pagesOf(100);
		expect(await collect(paginate(fetch), 3)).toEqual([0, 1, 2]);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('stops at the count the server reported, however long it claims hasMore', async () => {
		const fetch = vi.fn(
			async (): Promise<Page<number>> => ({ items: [1, 2], count: 4, hasMore: true }),
		);
		expect(await collect(paginate(fetch))).toEqual([1, 2, 1, 2]);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('gives up against a server whose count is as wrong as its hasMore', async () => {
		const fetch = vi.fn(
			async (): Promise<Page<number>> => ({
				items: [1, 2],
				count: Number.MAX_SAFE_INTEGER,
				hasMore: true,
			}),
		);
		const items = await collect(paginate(fetch));
		expect(fetch).toHaveBeenCalledTimes(1000);
		expect(items).toHaveLength(2000);
	});

	it('fetches nothing for a limit of zero', async () => {
		const fetch = pagesOf(100);
		expect(await collect(paginate(fetch), 0)).toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
	});
});
