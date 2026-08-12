// A push trigger, not a poll: the activation hooks provision a Paperless-ngx
// Workflow whose Webhook action points back at this node's own URL, so Paperless
// does the event matching and n8n wakes only on a document the filters accepted.
// It needs Paperless-ngx 2.14 or newer, where the Webhook action shipped.

import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { normalizeTriggerEvent, SIGNATURE_HEADER } from '../../contexts/automation/domain/workflow';
import {
	createTriggerWorkflow,
	deleteTriggerWorkflow,
	readState,
	triggerWorkflowExists,
} from '../../contexts/automation/presentation/trigger.lifecycle';
import { triggerProperties } from '../../contexts/automation/presentation/trigger.properties';
import { TAXONOMY } from '../../contexts/taxonomy/domain/taxonomy';
import { loadTaxonomyOptions } from '../../contexts/taxonomy/presentation/taxonomy.load-options';
import { toBoolean } from '../../shared/domain/parameters';
import { toNodeError } from '../../shared/infrastructure/error-mapper';
import { createClient } from '../../shared/infrastructure/paperless-client';

export class PaperlessNgxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Paperless-Ngx Trigger',
		name: 'paperlessNgxTrigger',
		icon: { light: 'file:paperless.svg', dark: 'file:paperless.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Start a workflow when Paperless-ngx reports a document event',
		defaults: {
			name: 'Paperless-ngx Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'paperlessNgxApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				// Paperless does nothing with the response, so there is no reason to
				// hold its request open for the length of the n8n workflow.
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: triggerProperties,
	};

	methods = {
		loadOptions: {
			async getCorrespondents(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.correspondent);
			},
			async getDocumentTypes(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.documentType);
			},
			async getTags(this: ILoadOptionsFunctions) {
				return await loadTaxonomyOptions(this, TAXONOMY.tag);
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				try {
					return await triggerWorkflowExists(this, await createClient(this));
				} catch (cause) {
					throw toNodeError(this.getNode(), cause);
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				try {
					return await createTriggerWorkflow(this, await createClient(this));
				} catch (cause) {
					// A token that may read documents but not write workflows fails here
					// with a 403, and activation has to say so rather than report a
					// trigger that will never fire.
					throw toNodeError(this.getNode(), cause);
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				try {
					return await deleteTriggerWorkflow(this, await createClient(this));
				} catch (cause) {
					throw toNodeError(this.getNode(), cause);
				}
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const expected = readState(this)?.signature;
		const received = this.getHeaderData()[SIGNATURE_HEADER];

		if (
			toBoolean(this.getNodeParameter('verifySignature', true), true) &&
			// An absent stored signature is a rejection, not a free pass: with no state
			// in this mode's slot both sides would be `undefined` and an unsigned call
			// would compare equal.
			(expected === undefined || received !== expected)
		) {
			// No `workflowData`, so nothing executes. Anyone can reach a webhook URL,
			// and a workflow run is the thing worth withholding.
			return { webhookResponse: { status: 'rejected' } };
		}

		const event = normalizeTriggerEvent(this.getBodyData());
		const fetchFull = toBoolean(this.getNodeParameter('fetchFullDocument', true), true);

		if (!fetchFull || event.docId === undefined) {
			return { workflowData: [this.helpers.returnJsonArray([event as IDataObject])] };
		}

		try {
			const client = await createClient(this);
			const document = await client.request<IDataObject>({
				method: 'GET',
				path: `/api/documents/${event.docId}/`,
			});
			return { workflowData: [this.helpers.returnJsonArray([{ ...event, document }])] };
		} catch (cause) {
			throw toNodeError(this.getNode(), cause);
		}
	}
}
