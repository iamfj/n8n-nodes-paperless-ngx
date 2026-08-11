import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

const showFor = (operations: string[]) => ({
	show: { resource: ['document'], operation: operations },
});

export const documentOperations: INodePropertyOptions[] = [
	{
		name: 'Delete',
		value: 'delete',
		description: 'Move a document to the trash',
		action: 'Delete a document',
	},
	{
		name: 'Download',
		value: 'download',
		description: 'Download the archived PDF, the original file or the thumbnail',
		action: 'Download a document file',
	},
	{
		name: 'Get',
		value: 'get',
		description: 'Retrieve a single document by ID',
		action: 'Get a document',
	},
	{
		name: 'Get Many',
		value: 'getMany',
		description: 'Search and list documents in the archive',
		action: 'Get many documents',
	},
	{
		name: 'Update',
		value: 'update',
		description: 'Change the title, Correspondent, Tags or other metadata of a document',
		action: 'Update a document',
	},
];

const documentId: INodeProperties = {
	displayName: 'Document ID',
	name: 'documentId',
	type: 'number',
	required: true,
	default: 0,
	typeOptions: { minValue: 1 },
	displayOptions: showFor(['get', 'download', 'update', 'delete']),
	description: 'ID of the document',
};

const permissionFields: INodeProperties[] = [
	{
		displayName: 'Grant View to Group IDs',
		name: 'viewGroups',
		type: 'string',
		default: '',
		placeholder: '1,2',
		description: 'Comma-separated group IDs allowed to view. Leave empty to leave unchanged.',
	},
	{
		displayName: 'Grant View to User IDs',
		name: 'viewUsers',
		type: 'string',
		default: '',
		placeholder: '1,2',
		description: 'Comma-separated user IDs allowed to view. Leave empty to leave unchanged.',
	},
	{
		displayName: 'Grant Change to Group IDs',
		name: 'changeGroups',
		type: 'string',
		default: '',
		placeholder: '1,2',
		description: 'Comma-separated group IDs allowed to change. Leave empty to leave unchanged.',
	},
	{
		displayName: 'Grant Change to User IDs',
		name: 'changeUsers',
		type: 'string',
		default: '',
		placeholder: '1,2',
		description: 'Comma-separated user IDs allowed to change. Leave empty to leave unchanged.',
	},
];

const includePermissions: INodeProperties = {
	displayName: 'Include Permissions',
	name: 'includePermissions',
	type: 'boolean',
	default: false,
	description: 'Whether to request the full permission block, which Paperless-ngx omits by default',
};

export const documentFields: INodeProperties[] = [
	documentId,

	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: showFor(['get']),
		options: [includePermissions],
	},

	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: showFor(['getMany']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: { resource: ['document'], operation: ['getMany'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add filter',
		default: {},
		displayOptions: showFor(['getMany']),
		options: [
			{
				displayName: 'Added After',
				name: 'addedAfter',
				type: 'dateTime',
				default: '',
				description: 'Only documents added to Paperless-ngx after this date',
			},
			{
				displayName: 'Added Before',
				name: 'addedBefore',
				type: 'dateTime',
				default: '',
				description: 'Only documents added to Paperless-ngx before this date',
			},
			{
				displayName: 'Archive Serial Number',
				name: 'archiveSerialNumber',
				type: 'number',
				default: 0,
				description: 'Only the document carrying this ASN',
			},
			{
				displayName: 'Correspondent Name or ID',
				name: 'correspondent',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getCorrespondents' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Created After',
				name: 'createdAfter',
				type: 'dateTime',
				default: '',
				description: 'Only documents whose creation date is after this date',
			},
			{
				displayName: 'Created Before',
				name: 'createdBefore',
				type: 'dateTime',
				default: '',
				description: 'Only documents whose creation date is before this date',
			},
			{
				displayName: 'Document Type Name or ID',
				name: 'documentType',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDocumentTypes' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			includePermissions,
			{
				displayName: 'Sort By',
				name: 'ordering',
				type: 'options',
				default: '-created',
				description: 'Field to sort the results by',
				options: [
					{ name: 'Added (Newest First)', value: '-added' },
					{ name: 'Added (Oldest First)', value: 'added' },
					{ name: 'Created (Newest First)', value: '-created' },
					{ name: 'Created (Oldest First)', value: 'created' },
					{ name: 'Modified (Newest First)', value: '-modified' },
					{ name: 'Title (A-Z)', value: 'title' },
					{ name: 'Title (Z-A)', value: '-title' },
				],
			},
			{
				displayName: 'Storage Path Name or ID',
				name: 'storagePath',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getStoragePaths' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Tag Names or IDs',
				name: 'tags',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getTags' },
				default: [],
				description:
					'Only documents carrying every selected tag. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Text',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Substring search across title and content',
			},
			{
				displayName: 'Text Search Title Only',
				name: 'titleOnly',
				type: 'boolean',
				default: false,
				description: 'Whether the Text filter searches the title only instead of title and content',
			},
			{
				displayName: 'Full Text Query',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: 'correspondent:acme AND created:[2026 TO 2027]',
				description:
					'Advanced full-text query in Paperless-ngx query syntax. A different search engine from Text — the two can be combined but rarely should be.',
			},
		],
	},

	{
		displayName: 'File',
		name: 'file',
		type: 'options',
		default: 'archived',
		displayOptions: showFor(['download']),
		description: 'Which of the document’s files to download',
		options: [
			{
				name: 'Archived',
				value: 'archived',
				description: 'The OCR-processed PDF, falling back to the original when none exists',
			},
			{ name: 'Original', value: 'original', description: 'The file exactly as it was consumed' },
			{ name: 'Thumbnail', value: 'thumbnail', description: 'The WebP preview image' },
		],
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: showFor(['download']),
		hint: 'The name of the output binary field to put the file in',
	},

	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: showFor(['update']),
		options: [
			{
				displayName: 'Archive Serial Number',
				name: 'archiveSerialNumber',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'ASN to assign. Must be unique across the archive; 0 clears it.',
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'The document’s OCR text, which Paperless-ngx indexes for search',
			},
			{
				displayName: 'Correspondent Name or ID',
				name: 'correspondent',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getCorrespondents' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Created',
				name: 'created',
				type: 'dateTime',
				default: '',
				description: 'The date the document itself was created, not the date it was consumed',
			},
			{
				displayName: 'Document Type Name or ID',
				name: 'documentType',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDocumentTypes' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Owner ID',
				name: 'owner',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description:
					'User ID to transfer ownership to. 0 removes the owner, which drops the document’s object-level permissions.',
			},
			{
				displayName: 'Storage Path Name or ID',
				name: 'storagePath',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getStoragePaths' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Tag Names or IDs',
				name: 'tags',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getTags' },
				default: [],
				description:
					'Replaces the document’s tags entirely. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'New title for the document',
			},
			...permissionFields,
		],
	},
];
