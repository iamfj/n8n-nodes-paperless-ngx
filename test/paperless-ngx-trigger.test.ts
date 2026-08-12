import type { IDataObject, IHookFunctions, IWebhookFunctions } from 'n8n-workflow';
import {
	normalizeTriggerEvent,
	SIGNATURE_HEADER,
	workflowName,
} from '../contexts/automation/domain/workflow';
import { PaperlessNgxTrigger } from '../nodes/PaperlessNgx/PaperlessNgxTrigger.node';
import { TRUNCATED_OPTION_VALUE } from '../shared/domain/load-options';
import { createFakeHookFunctions } from './fake-execute-functions';
import { headersV10 } from './fixtures/paperless';

const node = new PaperlessNgxTrigger();
const hooks = node.webhookMethods.default;

// UUID-shaped so it reads as what Paperless is handed, and inert so the secrets
// lint heuristic has nothing to find.
const SIGNATURE = '00000000-0000-4000-8000-000000000000';

const createdWorkflow = {
	id: 7,
	name: 'n8n Paperless-ngx Trigger (f47ac10b)',
	triggers: [{ id: 11, type: 2 }],
	actions: [{ id: 12, type: 4 }],
};

const stored = (overrides: Record<string, unknown> = {}) => ({
	paperlessWorkflow: {
		workflowId: 7,
		triggerIds: [11],
		actionIds: [12],
		url: 'https://n8n.example.com/webhook/abc/webhook',
		signature: SIGNATURE,
		...overrides,
	},
});

const ok = (body: unknown) => ({ statusCode: 200, headers: headersV10, body });

/** The options object handed to n8n for the nth call, which is the contract. */
const requestOptions = (http: { mock: { calls: unknown[][] } }, index = 0) =>
	http.mock.calls[index][1] as { method: string; url: string; body?: IDataObject };

describe('trigger activation', () => {
	it('provisions a Paperless workflow whose webhook action points at the node URL', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded', filters: { tags: [5, 8], correspondent: 3 } },
		});
		fake.http.mockResolvedValue(ok(createdWorkflow));

		await hooks.create.call(fake.ctx as IHookFunctions);

		const options = requestOptions(fake.http);
		expect(options.method).toBe('POST');
		expect(options.url).toBe('https://paperless.example.com/api/workflows/');
		expect(options.body).toMatchObject({
			name: 'n8n Paperless-ngx Trigger (f47ac10b)',
			enabled: true,
			triggers: [
				{
					type: 2,
					filter_has_tags: [5, 8],
					filter_has_correspondent: 3,
					filter_has_document_type: null,
				},
			],
			actions: [
				{
					type: 4,
					webhook: {
						url: 'https://n8n.example.com/webhook/abc/webhook',
						use_params: true,
						as_json: true,
						include_document: false,
					},
				},
			],
		});
	});

	it('sends the placeholders Paperless expands, docId included', async () => {
		const fake = createFakeHookFunctions({ parameters: { event: 'documentAdded' } });
		fake.http.mockResolvedValue(ok(createdWorkflow));

		await hooks.create.call(fake.ctx as IHookFunctions);

		const [action] = (requestOptions(fake.http).body as { actions: { webhook: IDataObject }[] })
			.actions;
		expect(action.webhook.params).toMatchObject({ docId: '{{doc_id}}', event: 'documentAdded' });
	});

	it('remembers the ids and the signature so deactivation can undo the work', async () => {
		const fake = createFakeHookFunctions({ parameters: { event: 'documentUpdated' } });
		fake.http.mockResolvedValue(ok(createdWorkflow));

		await hooks.create.call(fake.ctx as IHookFunctions);

		expect(fake.staticData.paperlessWorkflow).toMatchObject({
			workflowId: 7,
			triggerIds: [11],
			actionIds: [12],
		});
	});

	it('names the test workflow apart from the production one, which shares the unique name', async () => {
		const fake = createFakeHookFunctions({
			mode: 'manual',
			parameters: { event: 'documentAdded' },
			// A different id from the created workflow's, so writing the wrong slot fails.
			staticData: stored({ workflowId: 3 }),
		});
		fake.http.mockResolvedValue(ok(createdWorkflow));

		await hooks.create.call(fake.ctx as IHookFunctions);

		expect(requestOptions(fake.http).body?.name).toMatch(/\[test\]$/);
		// The production slot is untouched: only `paperlessWorkflowTest` was written.
		expect(fake.staticData.paperlessWorkflow).toMatchObject({ workflowId: 3 });
		expect(fake.staticData.paperlessWorkflowTest).toMatchObject({ workflowId: 7 });
	});

	it('clears a leftover workflow first, because the name is unique in Paperless', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded' },
			staticData: stored({ workflowId: 3 }),
		});
		fake.http.mockResolvedValue(ok(createdWorkflow));

		await hooks.create.call(fake.ctx as IHookFunctions);

		expect(requestOptions(fake.http, 0)).toMatchObject({
			method: 'DELETE',
			url: 'https://paperless.example.com/api/workflows/3/',
		});
		expect(requestOptions(fake.http, 3)).toMatchObject({ method: 'POST' });
	});

	it('refuses the truncation notice rather than provisioning an unfiltered workflow', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded', filters: { tags: [TRUNCATED_OPTION_VALUE] } },
		});

		await expect(hooks.create.call(fake.ctx as IHookFunctions)).rejects.toThrow(
			/Tags filter resolved to no usable ID/,
		);
		expect(fake.http).not.toHaveBeenCalled();
	});

	it('refuses a scalar filter an expression left as a name, which would go out as null', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded', filters: { correspondent: 'Stadtwerke' } },
		});

		await expect(hooks.create.call(fake.ctx as IHookFunctions)).rejects.toThrow(
			/Correspondent filter resolved to no usable ID/,
		);
		expect(fake.http).not.toHaveBeenCalled();
	});

	it('activates on a filter row added and left at its default, which filters on nothing', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded', filters: { correspondent: '', tags: [] } },
		});
		fake.http.mockResolvedValue(ok(createdWorkflow));

		await hooks.create.call(fake.ctx as IHookFunctions);

		expect(
			(requestOptions(fake.http).body as { triggers: IDataObject[] }).triggers[0],
		).toMatchObject({ filter_has_tags: [], filter_has_correspondent: null });
	});

	it('reports a token that may not write workflows instead of activating silently', async () => {
		const fake = createFakeHookFunctions({ parameters: { event: 'documentAdded' } });
		fake.http.mockResolvedValue({
			statusCode: 403,
			headers: headersV10,
			body: { detail: 'You do not have permission to perform this action.' },
		});

		await expect(hooks.create.call(fake.ctx as IHookFunctions)).rejects.toMatchObject({
			httpCode: '403',
		});
	});
});

describe('trigger checkExists', () => {
	const existing = {
		id: 7,
		triggers: [
			{
				id: 11,
				type: 2,
				filter_has_tags: [],
				filter_has_correspondent: null,
				filter_has_document_type: null,
				filter_filename: null,
			},
		],
		actions: [{ id: 12, type: 4, webhook: { url: 'https://n8n.example.com/webhook/abc/webhook' } }],
	};

	it('is false when nothing was ever created', async () => {
		const fake = createFakeHookFunctions({ parameters: { event: 'documentAdded' } });

		expect(await hooks.checkExists.call(fake.ctx as IHookFunctions)).toBe(false);
		expect(fake.http).not.toHaveBeenCalled();
	});

	it('is true when Paperless still holds the same workflow', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded' },
			staticData: stored(),
		});
		fake.http.mockResolvedValue(ok(existing));

		expect(await hooks.checkExists.call(fake.ctx as IHookFunctions)).toBe(true);
	});

	it('is false once the webhook URL has drifted, so n8n re-creates it', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded' },
			staticData: stored(),
			webhookUrl: 'https://n8n.example.com/webhook/moved/webhook',
		});
		fake.http.mockResolvedValue(ok(existing));

		expect(await hooks.checkExists.call(fake.ctx as IHookFunctions)).toBe(false);
	});

	it('is false once the chosen event no longer matches the provisioned trigger', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentUpdated' },
			staticData: stored(),
		});
		fake.http.mockResolvedValue(ok(existing));

		expect(await hooks.checkExists.call(fake.ctx as IHookFunctions)).toBe(false);
	});

	it('is false when the workflow was deleted inside Paperless', async () => {
		const fake = createFakeHookFunctions({
			parameters: { event: 'documentAdded' },
			staticData: stored(),
		});
		fake.http.mockResolvedValue({
			statusCode: 404,
			headers: headersV10,
			body: { detail: 'Not found.' },
		});

		expect(await hooks.checkExists.call(fake.ctx as IHookFunctions)).toBe(false);
	});
});

describe('trigger deactivation', () => {
	it('deletes the workflow and the rows Django leaves behind, then forgets them', async () => {
		const fake = createFakeHookFunctions({ staticData: stored() });
		fake.http.mockResolvedValue({ statusCode: 204, headers: headersV10, body: '' });

		await hooks.delete.call(fake.ctx as IHookFunctions);

		expect(fake.http.mock.calls.map((call) => (call[1] as { url: string }).url)).toEqual([
			'https://paperless.example.com/api/workflows/7/',
			'https://paperless.example.com/api/workflow_triggers/11/',
			'https://paperless.example.com/api/workflow_actions/12/',
		]);
		expect(fake.staticData.paperlessWorkflow).toBeUndefined();
	});

	it('still forgets the workflow when Paperless refuses the delete', async () => {
		// Otherwise the n8n workflow cannot be deactivated at all: every attempt
		// would fail on a row the token can no longer reach.
		const fake = createFakeHookFunctions({ staticData: stored() });
		fake.http.mockRejectedValue(new Error('socket hang up'));

		expect(await hooks.delete.call(fake.ctx as IHookFunctions)).toBe(true);
		expect(fake.staticData.paperlessWorkflow).toBeUndefined();
	});
});

describe('trigger webhook', () => {
	const call = (overrides: Parameters<typeof createFakeHookFunctions>[0] = {}) =>
		createFakeHookFunctions({
			staticData: stored(),
			headers: { [SIGNATURE_HEADER]: SIGNATURE },
			body: {
				event: 'documentAdded',
				docId: '42',
				title: 'Invoice 2026-04',
				url: 'https://paperless.example.com/documents/42/',
				correspondent: 'Stadtwerke',
				documentType: '',
			},
			...overrides,
		});

	it('parses the string docId Paperless renders and drops the empty placeholders', async () => {
		const fake = call({ parameters: { fetchFullDocument: false } });

		const result = await node.webhook.call(fake.ctx as IWebhookFunctions);

		expect(result.workflowData?.[0][0].json).toEqual({
			event: 'documentAdded',
			docId: 42,
			title: 'Invoice 2026-04',
			url: 'https://paperless.example.com/documents/42/',
			correspondent: 'Stadtwerke',
		});
	});

	it('loads the full document when asked, since the payload carries only placeholders', async () => {
		const fake = call();
		fake.http.mockResolvedValue(ok({ id: 42, title: 'Invoice 2026-04', tags: [5] }));

		const result = await node.webhook.call(fake.ctx as IWebhookFunctions);

		expect(requestOptions(fake.http).url).toBe('https://paperless.example.com/api/documents/42/');
		expect(result.workflowData?.[0][0].json.document).toMatchObject({ tags: [5] });
	});

	it('runs nothing when the signature header does not match', async () => {
		const fake = call({ headers: { [SIGNATURE_HEADER]: 'ffffffff-0000-4000-8000-000000000000' } });

		const result = await node.webhook.call(fake.ctx as IWebhookFunctions);

		expect(result.workflowData).toBeUndefined();
		expect(fake.http).not.toHaveBeenCalled();
	});

	it('runs nothing when the header is absent entirely', async () => {
		const fake = call({ headers: {} });

		expect((await node.webhook.call(fake.ctx as IWebhookFunctions)).workflowData).toBeUndefined();
	});

	it('runs nothing when no signature was ever stored, so two undefineds cannot match', async () => {
		const fake = call({ staticData: {}, headers: {} });

		const result = await node.webhook.call(fake.ctx as IWebhookFunctions);

		expect(result.workflowData).toBeUndefined();
		expect(fake.http).not.toHaveBeenCalled();
	});

	it('accepts an unsigned call once verification is switched off', async () => {
		const fake = call({
			headers: {},
			parameters: { verifySignature: false, fetchFullDocument: false },
		});

		const result = await node.webhook.call(fake.ctx as IWebhookFunctions);

		expect(result.workflowData?.[0][0].json.docId).toBe(42);
	});

	it('emits the event without a document when Consumption Started leaves docId empty', async () => {
		const fake = call({ body: { event: 'consumptionStarted', docId: '', filename: 'scan.pdf' } });

		const result = await node.webhook.call(fake.ctx as IWebhookFunctions);

		expect(result.workflowData?.[0][0].json).toEqual({
			event: 'consumptionStarted',
			filename: 'scan.pdf',
		});
		expect(fake.http).not.toHaveBeenCalled();
	});
});

describe('trigger node description', () => {
	it('is registered as a trigger with no input and all three lifecycle hooks', () => {
		expect(node.description.group).toEqual(['trigger']);
		expect(node.description.inputs).toEqual([]);
		expect(Object.keys(hooks).sort()).toEqual(['checkExists', 'create', 'delete']);
	});

	it('exposes a loadOptions method for every picker its filters reference', () => {
		const referenced = node.description.properties
			.flatMap((field) => (Array.isArray(field.options) ? field.options : []))
			.map((option) =>
				'typeOptions' in option ? option.typeOptions?.loadOptionsMethod : undefined,
			)
			.filter((method): method is string => typeof method === 'string');

		expect(referenced.length).toBeGreaterThan(0);
		for (const method of referenced) {
			expect(Object.keys(node.methods.loadOptions)).toContain(method);
		}
	});
});

describe('workflow naming', () => {
	it('keeps two copies of the node apart and marks the test run', () => {
		expect(workflowName('Paperless-ngx Trigger', 'f47ac10b-58cc-4372', false)).toBe(
			'n8n Paperless-ngx Trigger (f47ac10b)',
		);
		expect(workflowName('Paperless-ngx Trigger', 'f47ac10b-58cc-4372', true)).toMatch(/\[test\]$/);
	});
});

describe('normalizeTriggerEvent', () => {
	it('rejects a docId that is not a positive integer rather than passing NaN downstream', () => {
		expect(normalizeTriggerEvent({ event: 'documentAdded', docId: 'none' }).docId).toBeUndefined();
		expect(normalizeTriggerEvent({ event: 'documentAdded', docId: '0' }).docId).toBeUndefined();
	});

	it('names the event unknown rather than guessing when the payload carries none', () => {
		expect(normalizeTriggerEvent(undefined)).toEqual({ event: 'unknown' });
	});
});
