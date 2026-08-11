import { isDrfPage, pageQuery, toPage } from '../shared/domain/pagination';
import { documentsPageV9, documentsPageV10, profile } from './fixtures/paperless';

describe('pagination', () => {
	it('reduces a DRF page to items, count and hasMore', () => {
		expect(toPage(documentsPageV10)).toEqual({
			items: documentsPageV10.results,
			count: 31,
			hasMore: true,
		});
	});

	it('drops the next URL rather than exposing it', () => {
		expect(toPage(documentsPageV10)).not.toHaveProperty('next');
	});

	it('reports hasMore false on the last page', () => {
		expect(toPage({ count: 1, next: null, previous: null, results: [1] }).hasMore).toBe(false);
	});

	it('handles the v9 envelope, which carries an extra all key', () => {
		expect(toPage(documentsPageV9).count).toBe(31);
	});

	it.each([
		[documentsPageV10, true],
		[documentsPageV9, true],
		[profile, false],
		[null, false],
		['<html></html>', false],
		[{ count: 3 }, false],
		[[], false],
	])('recognises %o as a DRF page: %s', (value, expected) => {
		expect(isDrfPage(value)).toBe(expected);
	});

	it('maps page requests to Paperless query names and omits what is unset', () => {
		expect(pageQuery({ page: 2, pageSize: 50 })).toEqual({ page: 2, page_size: 50 });
		expect(pageQuery({ page: 2 })).toEqual({ page: 2 });
		expect(pageQuery({})).toEqual({});
	});
});
