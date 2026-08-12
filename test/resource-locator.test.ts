import type { IHttpRequestOptions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { searchDocuments } from '../contexts/archive/presentation/document.list-search';
import { TAXONOMY } from '../contexts/taxonomy/domain/taxonomy';
import { searchTaxonomy } from '../contexts/taxonomy/presentation/taxonomy.list-search';
import { locatorId } from '../shared/domain/load-options';
import { requiredLocatorId, resourceLocator } from '../shared/presentation/resource-locator';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import { headersV9, headersV10 } from './fixtures/paperless';

type Fake = ReturnType<typeof createFakeExecuteFunctions>;
const optionsOf = (http: Fake['http'], call = 0) => http.mock.calls[call][1] as IHttpRequestOptions;

const page = (results: unknown[], next: string | null = null) => ({
	count: results.length,
	next,
	previous: null,
	results,
});

describe('locatorId', () => {
	it('unwraps the mode/value pair a resourceLocator carries', () => {
		expect(locatorId({ mode: 'list', value: '7' })).toBe(7);
		expect(locatorId({ mode: 'id', value: 7 })).toBe(7);
	});

	it('reads a bare value, which is what an expression resolves to', () => {
		expect(locatorId(3)).toBe(3);
		expect(locatorId('3')).toBe(3);
	});

	it('treats an empty picker as unset rather than as the ID zero', () => {
		expect(locatorId({ mode: 'list', value: '' })).toBeUndefined();
		expect(locatorId(0)).toBeUndefined();
		expect(locatorId(undefined)).toBeUndefined();
		expect(locatorId({ mode: 'id', value: 'not-a-number' })).toBeUndefined();
	});
});

describe('requiredLocatorId', () => {
	const { ctx } = createFakeExecuteFunctions();

	it('returns the selected ID', () => {
		expect(requiredLocatorId(ctx.getNode(), { mode: 'list', value: '9' }, 'Document', 0)).toBe(9);
	});

	it('names the field instead of letting an empty picker reach the URL', () => {
		expect(() =>
			requiredLocatorId(ctx.getNode(), { mode: 'list', value: '' }, 'Correspondent', 0),
		).toThrow(NodeOperationError);
		expect(() => requiredLocatorId(ctx.getNode(), undefined, 'Correspondent', 0)).toThrow(
			/No Correspondent was selected/,
		);
	});
});

describe('resourceLocator', () => {
	const property = resourceLocator({
		displayName: 'Correspondent',
		name: 'correspondent',
		searchListMethod: 'searchCorrespondents',
		description: 'Correspondent to assign',
	});

	it('offers a searchable list and a by-ID fallback', () => {
		expect(property.type).toBe('resourceLocator');
		expect(property.default).toEqual({ mode: 'list', value: '' });
		const modes = property.modes ?? [];
		expect(modes.map((mode) => mode.name)).toEqual(['list', 'id']);
		expect(modes[0].typeOptions).toEqual({
			searchListMethod: 'searchCorrespondents',
			searchable: true,
		});
	});

	it('rejects an ID that Paperless-ngx would answer 404 for', () => {
		const validation = property.modes?.[1].validation?.[0] as unknown as {
			properties: { regex: string };
		};
		const pattern = new RegExp(validation.properties.regex);
		expect(pattern.test('42')).toBe(true);
		expect(pattern.test('0')).toBe(false);
		expect(pattern.test('-1')).toBe(false);
	});
});

describe('searchTaxonomy', () => {
	it('filters on the server rather than after the fetch', async () => {
		const fake = createFakeExecuteFunctions();
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: headersV10,
			body: page([{ id: 3, name: 'Acme' }]),
		});

		const result = await searchTaxonomy(fake.ctx, TAXONOMY.correspondent, 'acm');

		expect(optionsOf(fake.http).qs).toMatchObject({ name__icontains: 'acm', page: 1 });
		expect(result.results).toEqual([{ name: 'Acme', value: '3' }]);
	});

	it('omits the filter when the search box is untouched', async () => {
		const fake = createFakeExecuteFunctions();
		fake.http.mockResolvedValue({ statusCode: 200, headers: headersV10, body: page([]) });

		await searchTaxonomy(fake.ctx, TAXONOMY.tag, '');

		expect(optionsOf(fake.http).qs).not.toHaveProperty('name__icontains');
	});

	it('hands n8n the next page instead of capping the list', async () => {
		const fake = createFakeExecuteFunctions();
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: headersV10,
			body: page([{ id: 1, name: 'A' }], 'https://paperless.example.com/api/tags/?page=2'),
		});

		const first = await searchTaxonomy(fake.ctx, TAXONOMY.tag);
		expect(first.paginationToken).toBe('2');

		await searchTaxonomy(fake.ctx, TAXONOMY.tag, undefined, first.paginationToken as string);
		expect(optionsOf(fake.http, 1).qs).toMatchObject({ page: 2 });
	});

	it('ends the scroll when the last page comes back', async () => {
		const fake = createFakeExecuteFunctions();
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: headersV10,
			body: page([{ id: 1, name: 'A' }]),
		});

		expect((await searchTaxonomy(fake.ctx, TAXONOMY.tag)).paginationToken).toBeUndefined();
	});
});

describe('searchDocuments', () => {
	it('searches through the filter the negotiated version serves', async () => {
		const v10 = createFakeExecuteFunctions({ credentials: { apiVersion: '10' } });
		v10.http.mockResolvedValue({ statusCode: 200, headers: headersV10, body: page([]) });
		await searchDocuments(v10.ctx, 'invoice');
		expect(optionsOf(v10.http).qs).toMatchObject({ text: 'invoice' });

		const v9 = createFakeExecuteFunctions({ credentials: { apiVersion: '9' } });
		v9.http.mockResolvedValue({ statusCode: 200, headers: headersV9, body: page([]) });
		await searchDocuments(v9.ctx, 'invoice');
		expect(optionsOf(v9.http).qs).toMatchObject({ title_content: 'invoice' });
	});

	it('keeps an untitled document apart from every other untitled document', async () => {
		const fake = createFakeExecuteFunctions({ credentials: { apiVersion: '10' } });
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: headersV10,
			body: page([
				{ id: 42, title: 'Invoice 2026-04' },
				{ id: 43, title: '' },
			]),
		});

		const result = await searchDocuments(fake.ctx);

		expect(result.results).toEqual([
			{ name: 'Invoice 2026-04 (#42)', value: '42' },
			{ name: 'Document 43', value: '43' },
		]);
	});
});

describe('the pickers the node exposes', () => {
	it('names a listSearch method that the node implements', async () => {
		const { PaperlessNgx } = await import('../nodes/PaperlessNgx/PaperlessNgx.node');
		const node = new PaperlessNgx();
		const implemented = Object.keys(node.methods.listSearch);

		const referenced = new Set<string>();
		const walk = (properties: INodeProperties[]) => {
			for (const property of properties) {
				for (const mode of property.modes ?? []) {
					const method = (mode.typeOptions as { searchListMethod?: string } | undefined)
						?.searchListMethod;
					if (method) {
						referenced.add(method);
					}
				}
				walk((property.options ?? []) as INodeProperties[]);
			}
		};
		walk(node.description.properties);

		expect(referenced.size).toBeGreaterThan(0);
		for (const method of referenced) {
			expect(implemented).toContain(method);
		}
	});
});
