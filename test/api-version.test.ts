import {
	acceptHeader,
	isSupported,
	PREFERRED_API_VERSION,
	parseApiVersionHeader,
	SUPPORTED_API_VERSIONS,
	supports,
} from '../shared/domain/api-version';

describe('api version', () => {
	it('lists supported versions newest first', () => {
		expect(SUPPORTED_API_VERSIONS).toEqual([10, 9]);
		expect(PREFERRED_API_VERSION).toBe(10);
	});

	it('builds the Accept header Paperless negotiates on', () => {
		expect(acceptHeader(10)).toBe('application/json; version=10');
		expect(acceptHeader(9)).toBe('application/json; version=9');
	});

	it.each([
		['10', 10],
		[' 9 ', 9],
		[10, 10],
		[['9', '10'], 9],
	])('parses %o from the response header as %o', (raw, expected) => {
		expect(parseApiVersionHeader(raw)).toBe(expected);
	});

	it.each([undefined, null, '', 'latest', {}, 9.5])('parses %o as undefined', (raw) => {
		expect(parseApiVersionHeader(raw)).toBeUndefined();
	});

	it('recognises only the versions it can speak', () => {
		expect(isSupported(10)).toBe(true);
		expect(isSupported(9)).toBe(true);
		expect(isSupported(8)).toBe(false);
		expect(isSupported(11)).toBe(false);
	});

	it('answers capabilities per version, including the v9-only one', () => {
		expect(supports(10, 'titleSearch')).toBe(true);
		expect(supports(9, 'titleSearch')).toBe(false);
		expect(supports(10, 'individualDocumentEditEndpoints')).toBe(true);
		expect(supports(10, 'bulkEditObjectFilters')).toBe(true);
		expect(supports(10, 'redesignedTasks')).toBe(true);
		expect(supports(9, 'savedViewDisplayFlags')).toBe(true);
		expect(supports(10, 'savedViewDisplayFlags')).toBe(false);
	});
});
