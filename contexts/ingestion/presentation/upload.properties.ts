import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

const showFor = (operations: string[]) => ({
	show: { resource: ['document'], operation: operations },
});

export const uploadOperations: INodePropertyOptions[] = [
	{
		name: 'Upload',
		value: 'upload',
		description:
			'Send a file to the Paperless-ngx Consumption pipeline and, by default, wait for the document it produces',
		action: 'Upload a document',
	},
];

export const uploadFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: showFor(['upload']),
		hint: 'The name of the input binary field containing the file to upload',
	},
	{
		displayName: 'Wait for Consumption',
		name: 'waitForConsumption',
		type: 'boolean',
		default: true,
		displayOptions: showFor(['upload']),
		description:
			'Whether to wait for Paperless-ngx to finish consuming the file and return the resulting document. When off, the Consumption task ID is returned instead.',
	},
	{
		displayName: 'Timeout (Seconds)',
		name: 'timeout',
		type: 'number',
		default: 300,
		typeOptions: { minValue: 0 },
		displayOptions: {
			show: { resource: ['document'], operation: ['upload'], waitForConsumption: [true] },
		},
		description:
			'How long to wait for Consumption before failing. OCR on a long scan routinely takes minutes.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: showFor(['upload']),
		options: [
			{
				displayName: 'Archive Serial Number',
				name: 'archiveSerialNumber',
				type: 'number',
				default: 0,
				description: 'ASN to assign to the new document. Must be unique across the archive.',
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
				description:
					'The date the document itself was created. Paperless-ngx infers one if omitted.',
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
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Title for the new document. Paperless-ngx uses the file name if omitted.',
			},
		],
	},
];
