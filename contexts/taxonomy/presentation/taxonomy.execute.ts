import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { collect, paginate } from '../../../shared/domain/paginate';
import { optionalBoolean, toBoolean } from '../../../shared/domain/parameters';
import type { PaperlessClient } from '../../../shared/infrastructure/paperless-client';
import { type TaxonomyDescriptor, taxonomyBody } from '../domain/taxonomy';

const PAGE_SIZE = 100;

const OPERATIONS = ['create', 'get', 'getMany', 'update', 'delete'] as const;

export type TaxonomyOperation = (typeof OPERATIONS)[number];

export function isTaxonomyOperation(operation: string): operation is TaxonomyOperation {
	return (OPERATIONS as readonly string[]).includes(operation);
}

/**
 * A dropdown filled by an expression or by an AI agent arrives as `'6'`, not
 * `6`. Reading only the number would drop the choice and create the resource
 * with the server's default matching algorithm without reporting it.
 */
function optionalMatchingAlgorithm(raw: unknown): number | undefined {
	const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
	return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function bodyFrom(descriptor: TaxonomyDescriptor, fields: IDataObject): Record<string, unknown> {
	const extras: Record<string, unknown> = {};
	for (const field of descriptor.extraFields) {
		const value = fields[field.name];
		if (typeof value === 'string' && value.length > 0) {
			extras[field.name] = value;
		}
	}
	return taxonomyBody({
		name: typeof fields.name === 'string' && fields.name.length > 0 ? fields.name : undefined,
		match: typeof fields.match === 'string' ? fields.match : undefined,
		matchingAlgorithm: optionalMatchingAlgorithm(fields.matchingAlgorithm),
		isInsensitive: optionalBoolean(fields.isInsensitive),
		extras,
	});
}

export async function executeTaxonomy(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
	descriptor: TaxonomyDescriptor,
	operation: TaxonomyOperation,
): Promise<INodeExecutionData[]> {
	const item = (json: IDataObject): INodeExecutionData[] => [
		{ json, pairedItem: { item: itemIndex } },
	];

	if (operation === 'create') {
		// The required top-level fields and the optional collection are merged
		// before the body is built, so the descriptor decides which is which and
		// this function does not have to know about StoragePath's `path`.
		const required: IDataObject = { name: ctx.getNodeParameter('name', itemIndex) as string };
		for (const field of descriptor.extraFields.filter((entry) => entry.required)) {
			required[field.name] = ctx.getNodeParameter(field.name, itemIndex) as string;
		}
		const additional = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
		return item(
			await client.request<IDataObject>({
				method: 'POST',
				path: descriptor.endpoint,
				body: bodyFrom(descriptor, { ...additional, ...required }),
			}),
		);
	}

	if (operation === 'getMany') {
		const returnAll = toBoolean(ctx.getNodeParameter('returnAll', itemIndex, false), false);
		const limit = returnAll ? undefined : (ctx.getNodeParameter('limit', itemIndex, 50) as number);
		const filters = ctx.getNodeParameter('filters', itemIndex, {}) as IDataObject;
		const nameContains =
			typeof filters.nameContains === 'string' && filters.nameContains.length > 0
				? filters.nameContains
				: undefined;

		const results = await collect(
			paginate<IDataObject>((page) =>
				client.requestPage<IDataObject>({
					method: 'GET',
					path: descriptor.endpoint,
					qs: {
						name__icontains: nameContains,
						page,
						page_size: limit === undefined ? PAGE_SIZE : Math.min(limit, PAGE_SIZE),
					},
				}),
			),
			limit,
		);
		return results.map((json) => ({ json, pairedItem: { item: itemIndex } }));
	}

	const taxonomyId = ctx.getNodeParameter('taxonomyId', itemIndex) as number;
	const path = `${descriptor.endpoint}${taxonomyId}/`;

	if (operation === 'get') {
		return item(await client.request<IDataObject>({ method: 'GET', path }));
	}

	if (operation === 'update') {
		const fields = ctx.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
		return item(
			await client.request<IDataObject>({
				method: 'PATCH',
				path,
				body: bodyFrom(descriptor, fields),
			}),
		);
	}

	await client.request<unknown>({ method: 'DELETE', path });
	return item({ id: taxonomyId, deleted: true });
}
