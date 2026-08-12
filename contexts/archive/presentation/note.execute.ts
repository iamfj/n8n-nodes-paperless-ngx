import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { PaperlessClient } from '../../../shared/infrastructure/paperless-client';
import { requiredLocatorId } from '../../../shared/presentation/resource-locator';

// The notes action is not paginated (`pagination_class=None` upstream) and every
// method — GET, POST and DELETE alike — answers with the document's full notes
// array, so all three read the same way. There is no per-note endpoint to fetch.
type Note = IDataObject & { id?: number };

const OPERATIONS = ['getMany', 'create', 'delete'] as const;

export type NoteOperation = (typeof OPERATIONS)[number];

export function isNoteOperation(operation: string): operation is NoteOperation {
	return (OPERATIONS as readonly string[]).includes(operation);
}

function requestFor(
	ctx: IExecuteFunctions,
	itemIndex: number,
	operation: NoteOperation,
	documentId: number,
) {
	const path = `/api/documents/${documentId}/notes/`;
	if (operation === 'create') {
		return {
			method: 'POST' as const,
			path,
			body: { note: ctx.getNodeParameter('note', itemIndex) as string },
		};
	}
	if (operation === 'delete') {
		// The note is identified by a query parameter, not by a path segment:
		// `request.GET.get("id")` upstream.
		return {
			method: 'DELETE' as const,
			path,
			qs: { id: ctx.getNodeParameter('noteId', itemIndex) as number },
		};
	}
	return { method: 'GET' as const, path };
}

export async function executeNote(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
	operation: NoteOperation,
): Promise<INodeExecutionData[]> {
	const documentId = requiredLocatorId(
		ctx.getNode(),
		ctx.getNodeParameter('documentId', itemIndex),
		'Document',
		itemIndex,
	);
	const notes = await client.request<Note[]>(requestFor(ctx, itemIndex, operation, documentId));

	if (operation === 'delete') {
		// Deleting the only note leaves an empty array, and mapping that would drop
		// the item from the output entirely; delete reports itself instead.
		const noteId = ctx.getNodeParameter('noteId', itemIndex) as number;
		return [
			{
				json: { id: noteId, document: documentId, deleted: true },
				pairedItem: { item: itemIndex },
			},
		];
	}
	if (!Array.isArray(notes)) {
		return [{ json: { document: documentId, notes }, pairedItem: { item: itemIndex } }];
	}
	return notes.map((json) => ({
		json: { ...json, document: documentId },
		pairedItem: { item: itemIndex },
	}));
}
