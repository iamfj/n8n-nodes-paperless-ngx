import type { IHttpRequestOptions } from 'n8n-workflow';
import { TAXONOMY, taxonomyBody } from '../contexts/taxonomy/domain/taxonomy';
import { executeTaxonomy } from '../contexts/taxonomy/presentation/taxonomy.execute';
import { loadTaxonomyOptions } from '../contexts/taxonomy/presentation/taxonomy.load-options';
import {
	taxonomyFields,
	taxonomyOperations,
} from '../contexts/taxonomy/presentation/taxonomy.properties';
import { TRUNCATED_OPTION_VALUE } from '../shared/domain/load-options';
import { createClient } from '../shared/infrastructure/paperless-client';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import { headersV10 } from './fixtures/paperless';

const ok = (body: unknown) => ({ statusCode: 200, headers: headersV10, body });

type Fake = ReturnType<typeof createFakeExecuteFunctions>;
const optionsOf = (http: Fake['http'], call = 0) => http.mock.calls[call][1] as IHttpRequestOptions;

const page = (results: unknown[]) => ({
	count: results.length,
	next: null,
	previous: null,
	results,
});

async function run(
	fake: Fake,
	descriptor: (typeof TAXONOMY)[keyof typeof TAXONOMY],
	operation: Parameters<typeof executeTaxonomy>[4],
) {
	const client = await createClient(fake.ctx);
	return await executeTaxonomy(fake.ctx, 0, client, descriptor, operation);
}

describe('taxonomyBody', () => {
	it('renames the camelCase fields to the serializer names', () => {
		expect(taxonomyBody({ name: 'Acme', matchingAlgorithm: 6, isInsensitive: true })).toEqual({
			name: 'Acme',
			matching_algorithm: 6,
			is_insensitive: true,
		});
	});

	it('sends nothing for fields the caller left out', () => {
		expect(taxonomyBody({ name: 'Acme' })).toEqual({ name: 'Acme' });
	});

	it('carries the resource-specific extras through unchanged', () => {
		expect(taxonomyBody({ extras: { color: '#ff0000' } })).toEqual({ color: '#ff0000' });
	});
});

describe('taxonomy descriptors', () => {
	it.each(Object.values(TAXONOMY))('offers full CRUD for $displayName', (descriptor) => {
		expect(taxonomyOperations(descriptor).map((entry) => entry.value)).toEqual([
			'create',
			'delete',
			'get',
			'getMany',
			'update',
		]);
	});

	it("keeps StoragePath's required path outside the optional collection", () => {
		const fields = taxonomyFields(TAXONOMY.storagePath);
		const path = fields.find((field) => field.name === 'path');
		expect(path?.required).toBe(true);
		const additional = fields.find((field) => field.name === 'additionalFields');
		expect(additional?.options?.some((option) => 'name' in option && option.name === 'path')).toBe(
			false,
		);
	});

	it('offers a Tag colour, which no other taxonomy resource has', () => {
		const additional = taxonomyFields(TAXONOMY.tag).find(
			(field) => field.name === 'additionalFields',
		);
		expect(additional?.options?.some((option) => 'name' in option && option.name === 'color')).toBe(
			true,
		);
	});
});

describe('taxonomy execute', () => {
	it('creates against the resource endpoint, merging the required and optional fields', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { name: 'Acme GmbH', additionalFields: { match: 'acme', matchingAlgorithm: 1 } },
		});
		fake.http.mockResolvedValue(ok({ id: 3, name: 'Acme GmbH' }));

		await run(fake, TAXONOMY.correspondent, 'create');

		const options = optionsOf(fake.http);
		expect(options.method).toBe('POST');
		expect(options.url).toBe('https://paperless.example.com/api/correspondents/');
		expect(options.body).toEqual({ name: 'Acme GmbH', match: 'acme', matching_algorithm: 1 });
	});

	it('sends a required extra field that lives outside the collection', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { name: 'By Year', path: '{{created_year}}/{{title}}', additionalFields: {} },
		});
		fake.http.mockResolvedValue(ok({ id: 2 }));

		await run(fake, TAXONOMY.storagePath, 'create');

		expect(optionsOf(fake.http).body).toEqual({
			name: 'By Year',
			path: '{{created_year}}/{{title}}',
		});
	});

	it('keeps a dropdown and a toggle an expression delivered as strings', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: {
				name: 'Acme GmbH',
				additionalFields: { matchingAlgorithm: '6', isInsensitive: 'true' },
			},
		});
		fake.http.mockResolvedValue(ok({ id: 3 }));

		await run(fake, TAXONOMY.correspondent, 'create');

		expect(optionsOf(fake.http).body).toEqual({
			name: 'Acme GmbH',
			matching_algorithm: 6,
			is_insensitive: true,
		});
	});

	it('filters a list by name and stops at the limit', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { returnAll: false, limit: 2, filters: { nameContains: 'acme' } },
		});
		fake.http.mockResolvedValue(ok(page([{ id: 3 }, { id: 4 }, { id: 5 }])));

		const result = await run(fake, TAXONOMY.tag, 'getMany');

		expect(optionsOf(fake.http).url).toBe('https://paperless.example.com/api/tags/');
		expect(optionsOf(fake.http).qs).toMatchObject({ name__icontains: 'acme' });
		expect(result).toHaveLength(2);
	});

	it('reads one entry by ID', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { taxonomyId: 4 } });
		fake.http.mockResolvedValue(ok({ id: 4, name: 'Invoice' }));

		const result = await run(fake, TAXONOMY.documentType, 'get');

		expect(optionsOf(fake.http).method).toBe('GET');
		expect(optionsOf(fake.http).url).toBe('https://paperless.example.com/api/document_types/4/');
		expect(result[0].json).toEqual({ id: 4, name: 'Invoice' });
	});

	it('PATCHes only the supplied fields on update', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { taxonomyId: 5, updateFields: { color: '#ff0000' } },
		});
		fake.http.mockResolvedValue(ok({ id: 5 }));

		await run(fake, TAXONOMY.tag, 'update');

		expect(optionsOf(fake.http).method).toBe('PATCH');
		expect(optionsOf(fake.http).url).toBe('https://paperless.example.com/api/tags/5/');
		expect(optionsOf(fake.http).body).toEqual({ color: '#ff0000' });
	});

	it('reports the deleted ID, since a 204 leaves nothing to pass through', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { taxonomyId: 7 } });
		fake.http.mockResolvedValue({ statusCode: 204, headers: headersV10, body: undefined });

		const result = await run(fake, TAXONOMY.documentType, 'delete');

		expect(optionsOf(fake.http).url).toBe('https://paperless.example.com/api/document_types/7/');
		expect(result[0].json).toEqual({ id: 7, deleted: true });
	});
});

describe('loadTaxonomyOptions', () => {
	it('lists entries by name for the dropdown', async () => {
		const fake = createFakeExecuteFunctions();
		fake.http.mockResolvedValue(
			ok(
				page([
					{ id: 3, name: 'Acme GmbH' },
					{ id: 4, name: 'Stadtwerke' },
				]),
			),
		);

		const options = await loadTaxonomyOptions(fake.ctx, TAXONOMY.correspondent);

		expect(optionsOf(fake.http).qs).toMatchObject({ ordering: 'name' });
		expect(options).toEqual([
			{ name: 'Acme GmbH', value: 3 },
			{ name: 'Stadtwerke', value: 4 },
		]);
	});

	it('says so in the list rather than truncating silently', async () => {
		const entries = Array.from({ length: 501 }, (_, index) => ({
			id: index + 1,
			name: `Entry ${index + 1}`,
		}));
		const fake = createFakeExecuteFunctions();
		fake.http
			.mockResolvedValueOnce(
				ok({ count: 501, next: 'next', previous: null, results: entries.slice(0, 100) }),
			)
			.mockResolvedValueOnce(
				ok({ count: 501, next: 'next', previous: null, results: entries.slice(100, 200) }),
			)
			.mockResolvedValueOnce(
				ok({ count: 501, next: 'next', previous: null, results: entries.slice(200, 300) }),
			)
			.mockResolvedValueOnce(
				ok({ count: 501, next: 'next', previous: null, results: entries.slice(300, 400) }),
			)
			.mockResolvedValueOnce(
				ok({ count: 501, next: 'next', previous: null, results: entries.slice(400, 500) }),
			)
			.mockResolvedValueOnce(
				ok({ count: 501, next: null, previous: null, results: [entries[500]] }),
			);

		const options = await loadTaxonomyOptions(fake.ctx, TAXONOMY.tag);

		expect(options).toHaveLength(501);
		expect(String(options[500].name)).toContain('More than 500 Tags');
		// Not `''`: that is how a deliberate "clear the Correspondent" arrives.
		expect(options[500].value).toBe(TRUNCATED_OPTION_VALUE);
	});
});
