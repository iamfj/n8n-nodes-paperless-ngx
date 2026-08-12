import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { TRUNCATED_OPTION_VALUE } from '../../../shared/domain/load-options';
import { collect, paginate } from '../../../shared/domain/paginate';
import { createClient } from '../../../shared/infrastructure/paperless-client';
import type { TaxonomyDescriptor } from '../domain/taxonomy';

/**
 * The last single-fetch dropdown in the node, and it exists only because Tags are
 * selected several at a time: n8n has no multi-value resourceLocator, and
 * `loadOptions` receives no search term to hand the server. Every single-value
 * picker moved to `taxonomy.list-search.ts`, which pages instead of capping.
 *
 * A dropdown that silently truncates is worse than one that is slow, so the cap
 * is high enough to cover every real instance and is stated in the label of the
 * last entry when it is hit.
 */
const MAX_OPTIONS = 500;
const PAGE_SIZE = 100;

export async function loadTaxonomyOptions(
	ctx: ILoadOptionsFunctions,
	descriptor: TaxonomyDescriptor,
): Promise<INodePropertyOptions[]> {
	const client = await createClient(ctx);
	const entries = await collect(
		paginate<{ id: number; name: string }>((page) =>
			client.requestPage({
				method: 'GET',
				path: descriptor.endpoint,
				qs: { ordering: 'name', page, page_size: PAGE_SIZE },
			}),
		),
		MAX_OPTIONS + 1,
	);

	const options: INodePropertyOptions[] = entries
		.slice(0, MAX_OPTIONS)
		.map((entry) => ({ name: entry.name, value: entry.id }));

	if (entries.length > MAX_OPTIONS) {
		options.push({
			name: `— More than ${MAX_OPTIONS} ${descriptor.pluralDisplayName}; enter an ID by expression —`,
			value: TRUNCATED_OPTION_VALUE,
		});
	}
	return options;
}
