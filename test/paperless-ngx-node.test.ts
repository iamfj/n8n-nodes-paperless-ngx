import type { INodeProperties } from 'n8n-workflow';
import { PaperlessNgx } from '../nodes/PaperlessNgx/PaperlessNgx.node';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import { headersV10 } from './fixtures/paperless';

const node = new PaperlessNgx();
const properties = node.description.properties;

const propertyNamed = (name: string, predicate: (field: INodeProperties) => boolean = () => true) =>
	properties.filter((field) => field.name === name).find(predicate);

describe('node description', () => {
	it('offers every resource the package claims', () => {
		const resource = properties.find((field) => field.name === 'resource');
		expect(resource?.options?.map((option) => 'value' in option && option.value)).toEqual([
			'correspondent',
			'document',
			'documentNote',
			'documentType',
			'storagePath',
			'tag',
		]);
	});

	it('lists Upload among the Document operations even though it lives in ingestion', () => {
		const operation = propertyNamed(
			'operation',
			(field) => field.displayOptions?.show?.resource?.[0] === 'document',
		);
		expect(operation?.options?.map((option) => 'value' in option && option.value)).toContain(
			'upload',
		);
	});

	it('gives every resource its own Operation property', () => {
		const resources = properties
			.filter((field) => field.name === 'operation')
			.map((field) => field.displayOptions?.show?.resource?.[0]);
		expect(new Set(resources).size).toBe(6);
	});

	it('exposes a loadOptions method for every picker a property references', () => {
		const referenced = new Set<string>();
		const walk = (fields: readonly INodeProperties[]) => {
			for (const field of fields) {
				const method = field.typeOptions?.loadOptionsMethod;
				if (typeof method === 'string') {
					referenced.add(method);
				}
				if (Array.isArray(field.options)) {
					walk(field.options.filter((option) => 'name' in option) as INodeProperties[]);
				}
			}
		};
		walk(properties);

		expect(referenced.size).toBeGreaterThan(0);
		for (const method of referenced) {
			expect(Object.keys(node.methods.loadOptions)).toContain(method);
		}
	});
});

describe('node execute', () => {
	const documentGet = (overrides: Record<string, unknown> = {}) =>
		createFakeExecuteFunctions({
			parameters: { resource: 'document', operation: 'get', documentId: 42, options: {} },
			...overrides,
		});

	it('routes a document get through the archive context', async () => {
		const fake = documentGet();
		fake.http.mockResolvedValue({
			statusCode: 200,
			headers: headersV10,
			body: { id: 42, title: 'Invoice' },
		});

		const [items] = await node.execute.call(fake.ctx);

		expect(items[0].json).toEqual({ id: 42, title: 'Invoice' });
	});

	it('reports an unroutable resource and operation pair rather than emitting nothing', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { resource: 'document', operation: 'incinerate' },
		});

		await expect(node.execute.call(fake.ctx)).rejects.toThrow(/not supported/);
	});

	it('reports an inherited Object.prototype key as unroutable rather than calling it', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { resource: 'constructor', operation: 'get' },
		});

		await expect(node.execute.call(fake.ctx)).rejects.toThrow(/not supported/);
	});

	it('turns a Paperless failure into a NodeApiError carrying the hint', async () => {
		const fake = documentGet();
		fake.http.mockResolvedValue({
			statusCode: 401,
			headers: headersV10,
			body: { detail: 'Invalid token.' },
		});

		await expect(node.execute.call(fake.ctx)).rejects.toMatchObject({
			description: expect.stringContaining('Token'),
		});
	});

	it('reports a message for a non-Error rejection under Continue on Fail', async () => {
		// The old `(cause as Error).message` threw a TypeError here, which escaped
		// the very branch that exists to keep the workflow running.
		const fake = documentGet({ continueOnFail: true });
		fake.http.mockRejectedValue('socket hang up');

		const [items] = await node.execute.call(fake.ctx);

		expect(typeof items[0].json.error).toBe('string');
		expect(items[0].json.error).toContain('socket hang up');
	});

	it('surfaces a malformed credential as a node error, not a raw one', async () => {
		// createClient runs inside the try for this reason: outside it, a bad base
		// URL bypassed Continue on Fail entirely.
		const fake = documentGet({ continueOnFail: true });
		fake.ctx.getCredentials = vi.fn(async () => {
			throw new Error('credentials not found');
		}) as unknown as typeof fake.ctx.getCredentials;

		const [items] = await node.execute.call(fake.ctx);

		expect(items[0].json.error).toContain('credentials not found');
	});
});
