// Programmatic style is deliberate: the resources here need multi-step calls
// (binary download, upload followed by a Consumption-task poll, return-all
// pagination loops) that declarative routing cannot express.

import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeProperties,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	executeDocument,
	isDocumentOperation,
} from '../../contexts/archive/presentation/document.execute';
import {
	documentFields,
	documentOperations,
} from '../../contexts/archive/presentation/document.properties';
import { executeNote, isNoteOperation } from '../../contexts/archive/presentation/note.execute';
import { noteFields, noteOperations } from '../../contexts/archive/presentation/note.properties';
import { executeUpload } from '../../contexts/ingestion/presentation/upload.execute';
import {
	uploadFields,
	uploadOperations,
} from '../../contexts/ingestion/presentation/upload.properties';
import { TAXONOMY, TAXONOMY_RESOURCES } from '../../contexts/taxonomy/domain/taxonomy';
import {
	executeTaxonomy,
	isTaxonomyOperation,
} from '../../contexts/taxonomy/presentation/taxonomy.execute';
import { loadTaxonomyOptions } from '../../contexts/taxonomy/presentation/taxonomy.load-options';
import {
	taxonomyFields,
	taxonomyOperations,
} from '../../contexts/taxonomy/presentation/taxonomy.properties';
import { toNodeError } from '../../shared/infrastructure/error-mapper';
import { createClient } from '../../shared/infrastructure/paperless-client';

function operationProperty(
	resource: string,
	options: INodePropertyOptions[],
	defaultValue: string,
): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options,
		default: defaultValue,
	};
}

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
				options: [
					{ name: 'Correspondent', value: 'correspondent' },
					{ name: 'Document', value: 'document' },
					{ name: 'Document Note', value: 'documentNote' },
					{ name: 'Document Type', value: 'documentType' },
					{ name: 'Storage Path', value: 'storagePath' },
					{ name: 'Tag', value: 'tag' },
				],
				default: 'document',
			},

			// Each context owns its own operations and fields; the node only decides
			// the order they appear in. Upload lives in `ingestion` but presents as a
			// Document operation, which is why the two lists are merged here rather
			// than one context knowing about the other.
			operationProperty('document', [...documentOperations, ...uploadOperations], 'get'),
			...documentFields,
			...uploadFields,

			operationProperty('documentNote', noteOperations, 'getMany'),
			...noteFields,

			...TAXONOMY_RESOURCES.flatMap((descriptor) => [
				operationProperty(descriptor.resource, taxonomyOperations(descriptor), 'getMany'),
				...taxonomyFields(descriptor),
			]),
		],
	};

	methods = {
		loadOptions: {
			async getCorrespondents(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.correspondent);
			},
			async getDocumentTypes(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.documentType);
			},
			async getStoragePaths(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.storagePath);
			},
			async getTags(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.tag);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const returnData: INodeExecutionData[] = [];
		let client: Awaited<ReturnType<typeof createClient>> | undefined;

		for (let i = 0; i < items.length; i++) {
			try {
				// Built inside the try: a malformed credential throws here, and outside
				// it that would surface as a raw error instead of a NodeApiError,
				// bypassing "Continue on Fail" entirely. Cached across items so a large
				// batch decrypts the credential once.
				client ??= await createClient(this);

				if (resource === 'document' && operation === 'upload') {
					returnData.push(...(await executeUpload(this, i, client)));
				} else if (resource === 'document' && isDocumentOperation(operation)) {
					returnData.push(...(await executeDocument(this, i, client, operation)));
				} else if (resource === 'documentNote' && isNoteOperation(operation)) {
					returnData.push(...(await executeNote(this, i, client, operation)));
				} else if (Object.hasOwn(TAXONOMY, resource) && isTaxonomyOperation(operation)) {
					// `hasOwn` rather than `in`: `constructor` and the rest of
					// Object.prototype would otherwise pass as a resource name.
					const descriptor = TAXONOMY[resource as keyof typeof TAXONOMY];
					returnData.push(...(await executeTaxonomy(this, i, client, descriptor, operation)));
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex: i },
					);
				}
			} catch (cause) {
				const error = toNodeError(this.getNode(), cause, i);
				if (!this.continueOnFail()) {
					throw error;
				}
				// `error.message` rather than `cause.message`: a rejection is not
				// guaranteed to be an Error, and toNodeError is the one place that
				// already knows how to turn anything into a readable message.
				returnData.push({ json: { error: error.message }, pairedItem: { item: i } });
			}
		}

		return [returnData];
	}
}
