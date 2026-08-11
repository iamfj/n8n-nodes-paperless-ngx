/**
 * Correspondent, Tag, DocumentType and StoragePath are the same thing to
 * Paperless-ngx: four `MatchingModel` subclasses behind four DRF ModelViewSets
 * with identical CRUD, identical pagination and an identical permission block.
 * They differ only in the endpoint and in two or three writable fields.
 *
 * The root AGENTS.md says a factory is earned once the duplication is real
 * rather than anticipated. Four near-identical resources is past that line, so
 * this descriptor is the factory — and it is local to this context on purpose,
 * because nothing outside taxonomy shares this shape.
 */
export type TaxonomyResource = 'correspondent' | 'tag' | 'documentType' | 'storagePath';

export type TaxonomyDescriptor = {
	resource: TaxonomyResource;
	/** Title case, because it reaches `displayName` and the operation actions. */
	displayName: string;
	pluralDisplayName: string;
	endpoint: string;
	/** Writable fields beyond the `MatchingModel` set every resource shares. */
	extraFields: readonly TaxonomyField[];
};

export type TaxonomyField = {
	/** The n8n parameter name; also the Paperless field name unless `apiName` says otherwise. */
	name: string;
	apiName?: string;
	displayName: string;
	description: string;
	type: 'string' | 'color';
	default: string;
	required?: boolean;
};

export const TAXONOMY: Record<TaxonomyResource, TaxonomyDescriptor> = {
	correspondent: {
		resource: 'correspondent',
		displayName: 'Correspondent',
		pluralDisplayName: 'Correspondents',
		endpoint: '/api/correspondents/',
		extraFields: [],
	},
	tag: {
		resource: 'tag',
		displayName: 'Tag',
		pluralDisplayName: 'Tags',
		endpoint: '/api/tags/',
		extraFields: [
			{
				name: 'color',
				displayName: 'Color',
				description: 'Colour shown behind the tag in the Paperless-ngx UI',
				type: 'color',
				default: '#a6cee3',
			},
		],
	},
	documentType: {
		resource: 'documentType',
		displayName: 'Document Type',
		pluralDisplayName: 'Document Types',
		endpoint: '/api/document_types/',
		extraFields: [],
	},
	storagePath: {
		resource: 'storagePath',
		displayName: 'Storage Path',
		pluralDisplayName: 'Storage Paths',
		endpoint: '/api/storage_paths/',
		extraFields: [
			{
				name: 'path',
				displayName: 'Path',
				description:
					'Filename template for documents filed here, for example {{created_year}}/{{correspondent}}/{{title}}',
				type: 'string',
				default: '',
				required: true,
			},
		],
	},
};

export const TAXONOMY_RESOURCES = Object.values(TAXONOMY);

/**
 * `MatchingModel.MATCH_*` — the integers Paperless-ngx stores. Exposed as a
 * dropdown because the raw number is meaningless in a workflow.
 */
export const MATCHING_ALGORITHMS = [
	{ name: 'None', value: 0, description: 'Never match automatically' },
	{ name: 'Any Word', value: 1, description: 'Match when any word in Match occurs' },
	{ name: 'All Words', value: 2, description: 'Match when every word in Match occurs' },
	{ name: 'Exact Match', value: 3, description: 'Match when Match occurs as an exact string' },
	{ name: 'Regular Expression', value: 4, description: 'Match when the regular expression hits' },
	{ name: 'Fuzzy Word', value: 5, description: 'Match on a fuzzy comparison of the words' },
	{ name: 'Auto', value: 6, description: 'Let the trained document classifier decide' },
] as const;

export type TaxonomyBody = {
	name?: string;
	match?: string;
	matchingAlgorithm?: number;
	isInsensitive?: boolean;
	extras?: Record<string, unknown>;
};

export function taxonomyBody(body: TaxonomyBody): Record<string, unknown> {
	const payload: Record<string, unknown> = { ...body.extras };
	if (body.name !== undefined) {
		payload.name = body.name;
	}
	if (body.match !== undefined) {
		payload.match = body.match;
	}
	if (body.matchingAlgorithm !== undefined) {
		payload.matching_algorithm = body.matchingAlgorithm;
	}
	if (body.isInsensitive !== undefined) {
		payload.is_insensitive = body.isInsensitive;
	}
	return payload;
}
