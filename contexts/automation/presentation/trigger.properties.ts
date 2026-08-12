import type { INodeProperties } from 'n8n-workflow';

export const triggerProperties: INodeProperties[] = [
	{
		displayName: 'Event',
		name: 'event',
		type: 'options',
		noDataExpression: true,
		default: 'documentAdded',
		description: 'Which Paperless-ngx event calls this webhook',
		options: [
			{
				name: 'Document Added',
				value: 'documentAdded',
				description: 'A document finished consumption and exists in the archive',
			},
			{
				name: 'Document Updated',
				value: 'documentUpdated',
				description: 'An existing document was edited',
			},
			{
				name: 'Consumption Started',
				value: 'consumptionStarted',
				// The document row does not exist yet at this point, so Paperless has no
				// ID or URL to render into the payload.
				description: 'A file entered consumption — carries the file name, but no document ID',
			},
		],
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add filter',
		default: {},
		description:
			'Conditions Paperless-ngx checks before it calls the webhook, so the workflow is not woken for documents it would discard',
		options: [
			{
				displayName: 'Correspondent Name or ID',
				name: 'correspondent',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getCorrespondents' },
				default: '',
				description:
					'Only documents with this Correspondent. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Document Type Name or ID',
				name: 'documentType',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDocumentTypes' },
				default: '',
				description:
					'Only documents with this Document Type. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'File Name Pattern',
				name: 'filename',
				type: 'string',
				default: '',
				placeholder: '*invoice*.pdf',
				description: 'Only files whose name matches this pattern, case-insensitively',
			},
			{
				displayName: 'Tag Names or IDs',
				name: 'tags',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getTags' },
				default: [],
				description:
					'Only documents carrying these Tags. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
	{
		displayName: 'Fetch Full Document',
		name: 'fetchFullDocument',
		type: 'boolean',
		default: true,
		description:
			'Whether to load the complete document record from Paperless-ngx. The webhook payload itself carries only the handful of fields Paperless renders into it.',
	},
	{
		displayName: 'Verify Signature Header',
		name: 'verifySignature',
		type: 'boolean',
		default: true,
		description:
			'Whether to reject calls that do not carry the header value this node gave Paperless-ngx when it created the workflow',
	},
];
