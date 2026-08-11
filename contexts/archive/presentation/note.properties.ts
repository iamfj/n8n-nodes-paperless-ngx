import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

const showFor = (operations: string[]) => ({
	show: { resource: ['documentNote'], operation: operations },
});

export const noteOperations: INodePropertyOptions[] = [
	{
		name: 'Create',
		value: 'create',
		description: 'Add a note to a document',
		action: 'Create a document note',
	},
	{
		name: 'Delete',
		value: 'delete',
		description: 'Remove a note from a document',
		action: 'Delete a document note',
	},
	{
		name: 'Get Many',
		value: 'getMany',
		description: 'List every note on a document',
		action: 'Get many document notes',
	},
];

// Get Many carries no Return All / Limit pair, unlike every other one in the
// node: the notes action is unpaginated upstream and answers with the document's
// whole array, so there is no page to cap and nothing for a limit to save.
export const noteFields: INodeProperties[] = [
	{
		displayName: 'Document ID',
		name: 'documentId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: showFor(['getMany', 'create', 'delete']),
		description: 'ID of the document the note belongs to',
	},
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 3 },
		displayOptions: showFor(['create']),
		description: 'Text of the note',
	},
	{
		displayName: 'Note ID',
		name: 'noteId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: showFor(['delete']),
		description: 'ID of the note to remove',
	},
];
