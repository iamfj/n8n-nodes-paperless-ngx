import { type ApiVersion, supports } from '../../../shared/domain/api-version';

/** What the node's filter collection collects, before it becomes a query string. */
export type DocumentFilters = {
	/** Substring search. Scoped to the title alone when `titleOnly` is set. */
	search?: string;
	titleOnly?: boolean;
	/** Full-text search in Tantivy syntax, which is a different engine from `search`. */
	query?: string;
	correspondent?: number;
	documentType?: number;
	storagePath?: number;
	tags?: number[];
	createdAfter?: string;
	createdBefore?: string;
	addedAfter?: string;
	addedBefore?: string;
	archiveSerialNumber?: number;
	ordering?: string;
};

/**
 * v10 deprecated `title_content` and split substring search into `text` (title
 * and content) and `title_search` (title only). v9 has neither: `title_content`
 * is the combined search, and a title-only search has to fall back to DRF's
 * generated `title__icontains`.
 */
function searchQuery(
	version: ApiVersion,
	search: string,
	titleOnly: boolean,
): Record<string, string> {
	if (supports(version, 'titleSearch')) {
		return titleOnly ? { title_search: search } : { text: search };
	}
	return titleOnly ? { title__icontains: search } : { title_content: search };
}

/**
 * `created__date__*` is a DateFilter upstream, validated by Django's `DateField`,
 * which rejects the full ISO 8601 timestamp an n8n `dateTime` property produces
 * and answers 400. `added__date__*` resolves to a DateTimeFilter and takes the
 * timestamp as it comes.
 */
function datePart(value: string | undefined): string | undefined {
	return value?.slice(0, 10);
}

export function documentListQuery(
	version: ApiVersion,
	filters: DocumentFilters,
): Record<string, unknown> {
	const query: Record<string, unknown> = {
		// DRF's own filter names, which is why they are snake_case here and nowhere
		// else: these strings go on the wire untouched.
		correspondent__id: filters.correspondent,
		document_type__id: filters.documentType,
		storage_path__id: filters.storagePath,
		// `__all` rather than `__in`: a document must carry every selected tag, which
		// is what a multi-select reads as. Comma-joined rather than repeated: the
		// filter splits its value on `,`, and Django's QueryDict would hand it only
		// the last of a repeated key.
		tags__id__all: filters.tags?.length ? filters.tags.join(',') : undefined,
		created__date__gt: datePart(filters.createdAfter),
		created__date__lt: datePart(filters.createdBefore),
		added__date__gt: filters.addedAfter,
		added__date__lt: filters.addedBefore,
		archive_serial_number: filters.archiveSerialNumber,
		query: filters.query,
		ordering: filters.ordering,
	};

	if (filters.search) {
		Object.assign(query, searchQuery(version, filters.search, filters.titleOnly === true));
	}

	return query;
}

export type DocumentPatch = {
	title?: string;
	content?: string;
	correspondent?: number | null;
	documentType?: number | null;
	storagePath?: number | null;
	tags?: number[];
	created?: string;
	archiveSerialNumber?: number | null;
	owner?: number | null;
};

export function documentPatchBody(patch: DocumentPatch): Record<string, unknown> {
	// Built key by key rather than by mapping the whole object: `null` is a
	// meaningful value here — it is how Paperless clears a Correspondent — so
	// "present" and "not undefined" are the test, not truthiness.
	const body: Record<string, unknown> = {};
	if (patch.title !== undefined) {
		body.title = patch.title;
	}
	if (patch.content !== undefined) {
		body.content = patch.content;
	}
	if (patch.correspondent !== undefined) {
		body.correspondent = patch.correspondent;
	}
	if (patch.documentType !== undefined) {
		body.document_type = patch.documentType;
	}
	if (patch.storagePath !== undefined) {
		body.storage_path = patch.storagePath;
	}
	if (patch.tags !== undefined) {
		body.tags = patch.tags;
	}
	if (patch.created !== undefined) {
		body.created = patch.created;
	}
	if (patch.archiveSerialNumber !== undefined) {
		body.archive_serial_number = patch.archiveSerialNumber;
	}
	if (patch.owner !== undefined) {
		body.owner = patch.owner;
	}
	return body;
}

export type DocumentFile = 'archived' | 'original' | 'thumbnail';

/**
 * `/download/` serves the archived PDF whenever one exists and falls back to the
 * original by itself, so "original" is a query flag rather than a second path.
 */
export function documentFileSpec(
	documentId: number,
	file: DocumentFile,
): { path: string; qs?: Record<string, unknown> } {
	if (file === 'thumbnail') {
		return { path: `/api/documents/${documentId}/thumb/` };
	}
	return {
		path: `/api/documents/${documentId}/download/`,
		qs: file === 'original' ? { original: 'true' } : undefined,
	};
}
