import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { TRUNCATED_OPTION_VALUE } from '../../../shared/domain/load-options';
import { collect, paginate } from '../../../shared/domain/paginate';
import { createClient } from '../../../shared/infrastructure/paperless-client';
import type { TaxonomyDescriptor } from '../domain/taxonomy';

/**
 * A dropdown that silently truncates is worse than one that is slow, but an
 * archive with tens of thousands of Correspondents would make the panel
 * unusable either way. The cap is high enough to cover every real instance and
 * is stated in the label of the last entry when it is hit, so the truncation is
 * never invisible.
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
