import type { IHttpRequestOptions } from 'n8n-workflow';
import {
	documentFileSpec,
	documentListQuery,
	documentPatchBody,
} from '../contexts/archive/domain/document';
import {
	executeDocument,
	isDocumentOperation,
} from '../contexts/archive/presentation/document.execute';
import { TRUNCATED_OPTION_VALUE } from '../shared/domain/load-options';
import { createClient } from '../shared/infrastructure/paperless-client';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import {
	documentsPageV10,
	headersNotAcceptable,
	headersV9,
	headersV10,
	versionMismatchError,
} from './fixtures/paperless';

const ok = (body: unknown, headers: Record<string, string> = headersV10) => ({
	statusCode: 200,
	headers,
	body,
});

type Fake = ReturnType<typeof createFakeExecuteFunctions>;
const optionsOf = (http: Fake['http'], call = 0) => http.mock.calls[call][1] as IHttpRequestOptions;

async function run(fake: Fake, operation: Parameters<typeof executeDocument>[3]) {
	const client = await createClient(fake.ctx);
	return await executeDocument(fake.ctx, 0, client, operation);
}

describe('documentListQuery', () => {
	it('uses v10 text search, which replaced the deprecated title_content', () => {
		expect(documentListQuery(10, { search: 'invoice' })).toMatchObject({ text: 'invoice' });
	});

	it('falls back to title_content on v9, which has no text parameter', () => {
		expect(documentListQuery(9, { search: 'invoice' })).toMatchObject({ title_content: 'invoice' });
	});

	it('uses title_search for a title-only search on v10', () => {
		expect(documentListQuery(10, { search: 'invoice', titleOnly: true })).toMatchObject({
			title_search: 'invoice',
		});
	});

	it('falls back to DRF title__icontains for a title-only search on v9', () => {
		expect(documentListQuery(9, { search: 'invoice', titleOnly: true })).toMatchObject({
			title__icontains: 'invoice',
		});
	});

	it.each([9, 10] as const)('maps the non-divergent filters identically on v%i', (version) => {
		expect(
			documentListQuery(version, {
				correspondent: 3,
				documentType: 1,
				storagePath: 2,
				tags: [5, 8],
				createdAfter: '2026-01-01',
				archiveSerialNumber: 12,
				ordering: '-created',
			}),
		).toMatchObject({
			correspondent__id: 3,
			document_type__id: 1,
			storage_path__id: 2,
			// `__all` and not `__in`: every selected tag must be present.
			tags__id__all: '5,8',
			created__date__gt: '2026-01-01',
			archive_serial_number: 12,
			ordering: '-created',
		});
	});

	it('omits an empty tag selection rather than sending an empty filter', () => {
		expect(documentListQuery(10, { tags: [] }).tags__id__all).toBeUndefined();
	});

	it('truncates the created bounds to a date, which is all Django DateField accepts', () => {
		expect(
			documentListQuery(10, {
				createdAfter: '2026-01-01T00:00:00.000Z',
				createdBefore: '2026-02-01T12:30:00.000Z',
				addedAfter: '2026-01-01T00:00:00.000Z',
			}),
		).toMatchObject({
			created__date__gt: '2026-01-01',
			created__date__lt: '2026-02-01',
			// `added__date__*` is a DateTimeFilter and keeps the timestamp.
			added__date__gt: '2026-01-01T00:00:00.000Z',
		});
	});
});

describe('documentPatchBody', () => {
	it('sends only the fields the caller supplied', () => {
		expect(documentPatchBody({ title: 'New' })).toEqual({ title: 'New' });
	});

	it('keeps an explicit null, which is how Paperless clears a Correspondent', () => {
		expect(documentPatchBody({ correspondent: null })).toEqual({ correspondent: null });
	});

	it('renames the camelCase fields to the serializer names', () => {
		expect(documentPatchBody({ documentType: 4, storagePath: 2, archiveSerialNumber: 7 })).toEqual({
			document_type: 4,
			storage_path: 2,
			archive_serial_number: 7,
		});
	});
});

describe('documentFileSpec', () => {
	it('asks /download/ for the archived PDF without a flag', () => {
		expect(documentFileSpec(42, 'archived')).toEqual({
			path: '/api/documents/42/download/',
			qs: undefined,
		});
	});

	it('adds original=true rather than using a different path', () => {
		expect(documentFileSpec(42, 'original')).toEqual({
			path: '/api/documents/42/download/',
			qs: { original: 'true' },
		});
	});

	it('uses the separate thumbnail endpoint', () => {
		expect(documentFileSpec(42, 'thumbnail').path).toBe('/api/documents/42/thumb/');
	});
});

describe('document execute', () => {
	it('requests a single document and passes it straight through', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { documentId: 42, options: {} } });
		fake.http.mockResolvedValue(ok({ id: 42, title: 'Invoice' }));

		const result = await run(fake, 'get');

		expect(optionsOf(fake.http).url).toBe('https://paperless.example.com/api/documents/42/');
		expect(result[0].json).toEqual({ id: 42, title: 'Invoice' });
	});

	it('requests the permission block only when asked, since Paperless omits it', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { documentId: 42, options: { includePermissions: true } },
		});
		fake.http.mockResolvedValue(ok({ id: 42 }));

		await run(fake, 'get');

		expect(optionsOf(fake.http).qs).toMatchObject({ full_perms: 'true' });
	});

	it('stops at the limit instead of walking every page', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { returnAll: false, limit: 1, filters: {} },
		});
		fake.http.mockResolvedValue(ok(documentsPageV10));

		const result = await run(fake, 'getMany');

		expect(result).toHaveLength(1);
		expect(fake.http).toHaveBeenCalledTimes(1);
		// Asking for a full page of 100 to keep one is work the instance does for
		// nothing, so a limit below the page size becomes the page size.
		expect(optionsOf(fake.http).qs).toMatchObject({ page_size: 1 });
	});

	it('keeps the full page size for a return-all walk', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { returnAll: true, filters: {} } });
		fake.http.mockResolvedValue(ok(documentsPageV10));

		await run(fake, 'getMany');

		expect(optionsOf(fake.http).qs).toMatchObject({ page_size: 100 });
	});

	it('walks pages until the server reports no more', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { returnAll: true, filters: { search: 'invoice' } },
		});
		fake.http
			.mockResolvedValueOnce(ok({ ...documentsPageV10, count: 2 }))
			.mockResolvedValueOnce(ok({ count: 2, next: null, previous: null, results: [{ id: 43 }] }));

		const result = await run(fake, 'getMany');

		expect(result.map((entry) => entry.json.id)).toEqual([42, 43]);
		expect(optionsOf(fake.http, 0).qs).toMatchObject({ text: 'invoice', page: 1 });
		expect(optionsOf(fake.http, 1).qs).toMatchObject({ page: 2 });
	});

	it('rebuilds the search filter for the version the 406 retry lands on', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { returnAll: false, limit: 1, filters: { search: 'invoice' } },
		});
		fake.http
			.mockResolvedValueOnce({
				statusCode: 406,
				headers: headersNotAcceptable,
				body: versionMismatchError,
			})
			.mockResolvedValueOnce(ok(documentsPageV10, headersV9));

		await run(fake, 'getMany');

		// A v10 `text=` replayed against v9 would be dropped by django-filter and
		// return the whole archive instead of the search hits.
		expect(optionsOf(fake.http, 0).qs).toMatchObject({ text: 'invoice' });
		expect(optionsOf(fake.http, 1).qs).toMatchObject({ title_content: 'invoice' });
		expect(optionsOf(fake.http, 1).qs).not.toHaveProperty('text');
	});

	it('downloads into the named binary field and keeps the served file name', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { documentId: 42, file: 'original', binaryPropertyName: 'file' },
		});
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': 'attachment; filename="invoice.pdf"',
			},
			body: Buffer.from('%PDF-1.7'),
		});

		const result = await run(fake, 'download');

		expect(optionsOf(fake.http).qs).toMatchObject({ original: 'true' });
		expect(optionsOf(fake.http).encoding).toBe('arraybuffer');
		expect(result[0].binary?.file.fileName).toBe('invoice.pdf');
	});

	it('invents a file name for a thumbnail, which carries no Content-Disposition', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { documentId: 42, file: 'thumbnail', binaryPropertyName: 'data' },
		});
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: { 'content-type': 'image/webp' },
			body: Buffer.from('RIFF'),
		});

		const result = await run(fake, 'download');

		expect(result[0].binary?.data.fileName).toBe('document-42');
	});

	it('PATCHes only the supplied fields and nests the permission arms', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: {
				documentId: 42,
				updateFields: { title: 'Renamed', tags: [5], viewUsers: '1, 2' },
			},
		});
		fake.http.mockResolvedValue(ok({ id: 42, title: 'Renamed' }));

		await run(fake, 'update');

		const options = optionsOf(fake.http);
		expect(options.method).toBe('PATCH');
		expect(options.body).toEqual({
			title: 'Renamed',
			tags: [5],
			// Only the arm the user filled in: an empty arm is a revocation.
			set_permissions: { view: { users: [1, 2] } },
		});
	});

	it('clears a Correspondent on an empty selection but not on the truncation notice', async () => {
		const cleared = createFakeExecuteFunctions({
			parameters: { documentId: 42, updateFields: { correspondent: '' } },
		});
		cleared.http.mockResolvedValue(ok({ id: 42 }));
		await run(cleared, 'update');
		expect(optionsOf(cleared.http).body).toEqual({ correspondent: null });

		const notice = createFakeExecuteFunctions({
			parameters: { documentId: 42, updateFields: { correspondent: TRUNCATED_OPTION_VALUE } },
		});
		notice.http.mockResolvedValue(ok({ id: 42 }));
		await run(notice, 'update');
		expect(optionsOf(notice.http).body).toEqual({});
	});

	it('rejects an inherited Object.prototype key as an operation', () => {
		expect(isDocumentOperation('constructor')).toBe(false);
		expect(isDocumentOperation('toString')).toBe(false);
		expect(isDocumentOperation('get')).toBe(true);
	});

	it('reports the deleted ID, since a 204 leaves nothing to pass through', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { documentId: 42 } });
		fake.http.mockResolvedValue({ statusCode: 204, headers: headersV10, body: undefined });

		const result = await run(fake, 'delete');

		expect(optionsOf(fake.http).method).toBe('DELETE');
		expect(result[0].json).toEqual({ id: 42, deleted: true });
	});
});
