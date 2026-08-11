// Skeleton node: it carries a single Document → Get operation so the dev loop,
// CI and the credential test have something loadable to compile against while
// the real resources land in later waves. Delete this comment once they do.
//
// Programmatic style is deliberate: upcoming resources need multi-step calls
// (resolving Correspondents/Tags by name, downloading binary originals and
// archives, polling Consumption tasks) that declarative routing cannot express.

import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

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
		const credentials = await this.getCredentials('paperlessNgxApi');
		const baseUrl = (credentials.baseUrl as string).replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				const documentId = this.getNodeParameter('documentId', i) as number;

				const document = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'paperlessNgxApi',
					{
						method: 'GET',
						url: `${baseUrl}/api/documents/${documentId}/`,
						json: true,
					},
				);

				returnData.push({ json: document, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
