import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { createClient } from '../../../shared/infrastructure/paperless-client';
import { documentListQuery } from '../domain/document';

const PAGE_SIZE = 50;

/**
 * The picker behind every Document ID field. The search term goes through
 * `documentListQuery`, so it lands on whichever substring filter the negotiated
 * API version actually serves rather than on a name this node picked.
 */
export async function searchDocuments(
	ctx: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const client = await createClient(ctx);
	const page = paginationToken === undefined ? 1 : Number(paginationToken);
	const { items, hasMore } = await client.requestPage<{ id: number; title?: string }>({
		method: 'GET',
		path: '/api/documents/',
		qs: (version) => ({
			...documentListQuery(version, { search: filter, ordering: '-created' }),
			page,
			page_size: PAGE_SIZE,
		}),
	});

	return {
		results: items.map((entry) => ({
			// A document can be stored with an empty title; the ID is then the only
			// thing that tells two entries apart in the dropdown.
			name: entry.title ? `${entry.title} (#${entry.id})` : `Document ${entry.id}`,
			value: String(entry.id),
		})),
		paginationToken: hasMore ? String(page + 1) : undefined,
	};
}
