import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { isChosen } from '../../../shared/domain/load-options';
import { collect, paginate } from '../../../shared/domain/paginate';
import {
	fullPermsQuery,
	toPermissionsPatch,
	toSetPermissions,
} from '../../../shared/domain/permissions';
import { toBinaryData } from '../../../shared/infrastructure/binary';
import type { PaperlessClient } from '../../../shared/infrastructure/paperless-client';
import {
	type DocumentFile,
	type DocumentFilters,
	type DocumentPatch,
	documentFileSpec,
	documentListQuery,
	documentPatchBody,
} from '../domain/document';

/**
 * Paperless-ngx caps `page_size` at 100000 but the default is 25, and every page
 * is a round trip. 100 keeps a return-all walk short without asking a
 * self-hosted instance to serialize thousands of documents at once.
 */
const PAGE_SIZE = 100;

/**
 * An empty collection field comes back as `''` or `0`, which for an optional ID
 * means "not set" rather than "set to zero". Only the update path distinguishes
 * `null` (clear it) from absent, and it does so explicitly.
 */
function optionalId(raw: unknown): number | undefined {
	const id = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
	return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined;
}

function optionalText(raw: unknown): string | undefined {
	return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function toDocumentFilters(raw: IDataObject): DocumentFilters {
	return {
		search: optionalText(raw.search),
		titleOnly: raw.titleOnly === true,
		query: optionalText(raw.query),
		correspondent: optionalId(raw.correspondent),
		documentType: optionalId(raw.documentType),
		storagePath: optionalId(raw.storagePath),
		tags: Array.isArray(raw.tags) ? raw.tags.map(Number).filter(Number.isInteger) : undefined,
		createdAfter: optionalText(raw.createdAfter),
		createdBefore: optionalText(raw.createdBefore),
		addedAfter: optionalText(raw.addedAfter),
		addedBefore: optionalText(raw.addedBefore),
		archiveSerialNumber: optionalId(raw.archiveSerialNumber),
		ordering: optionalText(raw.ordering),
	};
}

function toDocumentPatch(fields: IDataObject): DocumentPatch {
	const patch: DocumentPatch = {};
	if (optionalText(fields.title) !== undefined) {
		patch.title = fields.title as string;
	}
	if (typeof fields.content === 'string') {
		patch.content = fields.content;
	}
	if (isChosen(fields.correspondent)) {
		patch.correspondent = optionalId(fields.correspondent) ?? null;
	}
	if (isChosen(fields.documentType)) {
		patch.documentType = optionalId(fields.documentType) ?? null;
	}
	if (isChosen(fields.storagePath)) {
		patch.storagePath = optionalId(fields.storagePath) ?? null;
	}
	if (Array.isArray(fields.tags)) {
		patch.tags = fields.tags.map(Number).filter(Number.isInteger);
	}
	if (optionalText(fields.created) !== undefined) {
		patch.created = fields.created as string;
	}
	if (fields.archiveSerialNumber !== undefined) {
		patch.archiveSerialNumber = optionalId(fields.archiveSerialNumber) ?? null;
	}
	if (fields.owner !== undefined) {
		patch.owner = optionalId(fields.owner) ?? null;
	}
	return patch;
}

async function get(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
): Promise<INodeExecutionData[]> {
	const documentId = ctx.getNodeParameter('documentId', itemIndex) as number;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const document = await client.request<IDataObject>({
		method: 'GET',
		path: `/api/documents/${documentId}/`,
		qs: fullPermsQuery(options.includePermissions === true),
	});
	return [{ json: document, pairedItem: { item: itemIndex } }];
}

async function getMany(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
): Promise<INodeExecutionData[]> {
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? undefined : (ctx.getNodeParameter('limit', itemIndex, 50) as number);
	const filters = ctx.getNodeParameter('filters', itemIndex, {}) as IDataObject;

	const query = {
		...documentListQuery(await client.version(), toDocumentFilters(filters)),
		...fullPermsQuery(filters.includePermissions === true),
	};

	const documents = await collect(
		paginate<IDataObject>((page) =>
			client.requestPage<IDataObject>({
				method: 'GET',
				path: '/api/documents/',
				qs: {
					...query,
					page,
					page_size: limit === undefined ? PAGE_SIZE : Math.min(limit, PAGE_SIZE),
				},
			}),
		),
		limit,
	);

	return documents.map((json) => ({ json, pairedItem: { item: itemIndex } }));
}

async function download(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
): Promise<INodeExecutionData[]> {
	const documentId = ctx.getNodeParameter('documentId', itemIndex) as number;
	const file = ctx.getNodeParameter('file', itemIndex, 'archived') as DocumentFile;
	const binaryPropertyName = ctx.getNodeParameter(
		'binaryPropertyName',
		itemIndex,
		'data',
	) as string;

	const spec = documentFileSpec(documentId, file);
	const response = await client.requestBinary({ method: 'GET', ...spec });
	const binary = await toBinaryData(ctx, {
		data: response.data,
		// `/thumb/` sends no Content-Disposition at all, so there is no name to
		// inherit and one has to be invented rather than left blank.
		fileName: response.fileName ?? `document-${documentId}`,
		mimeType: response.mimeType,
	});

	return [
		{
			json: { documentId, file, fileName: binary.fileName, mimeType: binary.mimeType },
			binary: { [binaryPropertyName]: binary },
			pairedItem: { item: itemIndex },
		},
	];
}

async function update(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
): Promise<INodeExecutionData[]> {
	const documentId = ctx.getNodeParameter('documentId', itemIndex) as number;
	const fields = ctx.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
	const permissions = toPermissionsPatch(fields);

	const document = await client.request<IDataObject>({
		method: 'PATCH',
		path: `/api/documents/${documentId}/`,
		body: {
			...documentPatchBody(toDocumentPatch(fields)),
			...(permissions ? toSetPermissions(permissions) : {}),
		},
	});
	return [{ json: document, pairedItem: { item: itemIndex } }];
}

async function remove(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
): Promise<INodeExecutionData[]> {
	const documentId = ctx.getNodeParameter('documentId', itemIndex) as number;
	// A 204 leaves an empty body, so there is nothing to pass through; the node
	// still has to emit an item or the branch produces no output at all.
	await client.request<unknown>({ method: 'DELETE', path: `/api/documents/${documentId}/` });
	return [{ json: { id: documentId, deleted: true }, pairedItem: { item: itemIndex } }];
}

const OPERATIONS = { get, getMany, download, update, delete: remove } as const;

export type DocumentOperation = keyof typeof OPERATIONS;

export function isDocumentOperation(operation: string): operation is DocumentOperation {
	// `hasOwn` rather than `in`: `constructor` and the rest of Object.prototype are
	// reachable here from an expression or an AI agent, and would route to an
	// inherited function instead of the node's "not supported" message.
	return Object.hasOwn(OPERATIONS, operation);
}

export async function executeDocument(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
	operation: DocumentOperation,
): Promise<INodeExecutionData[]> {
	return await OPERATIONS[operation](ctx, itemIndex, client);
}
