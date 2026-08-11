// Programmatic style is deliberate: upcoming resources need multi-step calls
// (resolving Correspondents/Tags by name, downloading binary originals and
// archives, polling Consumption tasks) that declarative routing cannot express.

import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { toNodeError } from '../../shared/infrastructure/error-mapper';
import { createClient } from '../../shared/infrastructure/paperless-client';

export class PaperlessNgx implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Paperless-ngx',
		name: 'paperlessNgx',
		icon: { light: 'file:paperless.svg', dark: 'file:paperless.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the Paperless-ngx API',
		defaults: {
			name: 'Paperless-ngx',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'paperlessNgxApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Document', value: 'document' }],
				default: 'document',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['document'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Retrieve a single document',
						action: 'Get a document',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'number',
				required: true,
				default: 0,
				typeOptions: {
					minValue: 1,
				},
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['get'],
					},
				},
				description: 'ID of the document to retrieve',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const client = await createClient(this);

		for (let i = 0; i < items.length; i++) {
			const documentId = this.getNodeParameter('documentId', i) as number;

			const document = await client
				.request<IDataObject>({ method: 'GET', path: `/api/documents/${documentId}/` })
				.catch((cause: unknown) => {
					if (!this.continueOnFail()) {
						throw toNodeError(this.getNode(), cause, i);
					}
					return { error: (cause as Error).message };
				});

			returnData.push({ json: document, pairedItem: { item: i } });
		}

		return [returnData];
	}
}
