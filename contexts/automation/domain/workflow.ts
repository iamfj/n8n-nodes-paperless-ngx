/**
 * A Paperless-ngx Workflow with a single Webhook action, which is how this
 * package turns document events into an HTTP push instead of a poll. The Webhook
 * action type shipped in paperless-ngx 2.14
 * (https://github.com/paperless-ngx/paperless-ngx/pull/8108).
 */

/** `WorkflowTrigger.WorkflowTriggerType` in `src/documents/models.py`. */
export const TRIGGER_TYPE = {
	consumptionStarted: 1,
	documentAdded: 2,
	documentUpdated: 3,
} as const;

export type PaperlessTriggerEvent = keyof typeof TRIGGER_TYPE;

export function isTriggerEvent(value: string): value is PaperlessTriggerEvent {
	return Object.hasOwn(TRIGGER_TYPE, value);
}

/** `WorkflowAction.WorkflowActionType.WEBHOOK` in `src/documents/models.py`. */
const WEBHOOK_ACTION_TYPE = 4;

/**
 * Carries the value the node generated when it provisioned the Paperless
 * workflow, so a request that did not come from that workflow is rejected. Not
 * an HMAC: `WorkflowActionWebhook` in `src/documents/models.py` holds only a URL,
 * params, headers and a body, with no signing secret, so a shared random value in
 * a header is the whole of what Paperless can offer.
 */
export const SIGNATURE_HEADER = 'x-n8n-signature';

/**
 * The placeholders Paperless expands into the webhook body, listed under
 * "Workflows" in https://docs.paperless-ngx.com/usage/#workflows. They are
 * substituted into strings, so `docId` reaches n8n as text and is parsed back in
 * `normalizeTriggerEvent`. The same page marks `{{doc_id}}` and `{{doc_url}}` as
 * unavailable to the Consumption Started trigger, where no document row exists
 * yet — `text()` below is what turns the value they arrive with into "absent".
 */
export const WEBHOOK_PARAMS = {
	docId: '{{doc_id}}',
	title: '{{doc_title}}',
	url: '{{doc_url}}',
	correspondent: '{{correspondent}}',
	documentType: '{{document_type}}',
	owner: '{{owner_username}}',
	added: '{{added}}',
	filename: '{{filename}}',
} as const;

/**
 * Matched by Paperless before it calls out, so n8n is never woken for a document
 * the user does not care about. Storage path is absent on purpose: `WorkflowTrigger`
 * in `src/documents/models.py` carries no storage-path filter, and a key a DRF
 * serializer does not declare is dropped during validation rather than rejected
 * (https://www.django-rest-framework.org/api-guide/serializers/#validation), so
 * sending one would read as a filter that in fact matches everything.
 */
export type TriggerFilters = {
	tags?: number[];
	correspondent?: number;
	documentType?: number;
	/** Shell-style pattern against the file name, e.g. `*invoice*.pdf`. */
	filename?: string;
};

export type TriggerSpec = {
	name: string;
	event: PaperlessTriggerEvent;
	url: string;
	signature: string;
	filters?: TriggerFilters;
};

function triggerBody(event: PaperlessTriggerEvent, filters: TriggerFilters = {}) {
	return {
		type: TRIGGER_TYPE[event],
		// Sent even when empty, because an explicit value is what `matchesSpec`
		// compares the workflow it later reads back against.
		filter_has_tags: filters.tags ?? [],
		filter_has_correspondent: filters.correspondent ?? null,
		filter_has_document_type: filters.documentType ?? null,
		filter_filename: filters.filename ?? null,
	};
}

/**
 * `/api/workflows/` accepts triggers and actions nested in the same POST, so the
 * whole workflow is provisioned in one request and there are no half-created rows
 * to clean up if the second one fails.
 */
export function webhookWorkflowBody(spec: TriggerSpec): Record<string, unknown> {
	return {
		name: spec.name,
		order: 0,
		enabled: true,
		triggers: [triggerBody(spec.event, spec.filters)],
		actions: [
			{
				type: WEBHOOK_ACTION_TYPE,
				webhook: {
					url: spec.url,
					// `use_params` sends `params` as the body; `as_json` makes that body
					// JSON rather than form-encoded, which is what n8n parses.
					use_params: true,
					as_json: true,
					params: { ...WEBHOOK_PARAMS, event: spec.event },
					headers: { [SIGNATURE_HEADER]: spec.signature },
					// The file would arrive as multipart and n8n would leave it on disk;
					// reading it back needs `fs`, which n8n Cloud verification forbids.
					// Document → Download covers it downstream.
					include_document: false,
				},
			},
		],
	};
}

function sameIds(raw: unknown, expected: readonly number[]): boolean {
	const ascending = (a: number, b: number) => a - b;
	const actual = (Array.isArray(raw) ? raw.map(Number) : []).sort(ascending);
	const wanted = [...expected].sort(ascending);
	return actual.length === wanted.length && actual.every((id, index) => id === wanted[index]);
}

/** Whether a workflow read back from Paperless still matches the node's parameters. */
export function matchesSpec(workflow: unknown, spec: TriggerSpec): boolean {
	if (typeof workflow !== 'object' || workflow === null) {
		return false;
	}
	const { triggers, actions } = workflow as { triggers?: unknown[]; actions?: unknown[] };
	const trigger = triggers?.[0] as Record<string, unknown> | undefined;
	const action = actions?.[0] as { webhook?: { url?: unknown } } | undefined;
	if (trigger === undefined || action?.webhook?.url !== spec.url) {
		return false;
	}

	const expected = triggerBody(spec.event, spec.filters);
	return (
		trigger.type === expected.type &&
		sameIds(trigger.filter_has_tags, expected.filter_has_tags) &&
		(trigger.filter_has_correspondent ?? null) === expected.filter_has_correspondent &&
		(trigger.filter_has_document_type ?? null) === expected.filter_has_document_type &&
		// `WorkflowTrigger.filter_filename` in `src/documents/models.py` is a nullable
		// CharField, so a cleared filter reads back as either `null` or `''`.
		((trigger.filter_filename as string) || null) === expected.filter_filename
	);
}

export type TriggerEventPayload = {
	event: string;
	docId?: number;
	title?: string;
	url?: string;
	correspondent?: string;
	documentType?: string;
	owner?: string;
	added?: string;
	filename?: string;
};

function text(raw: unknown): string | undefined {
	// An unpopulated placeholder renders as the empty string, which means "this
	// trigger does not carry that value" rather than "the value is blank".
	return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function pick(key: string, value: string | undefined): Record<string, string> {
	return value === undefined ? {} : { [key]: value };
}

/**
 * The payload shape is this node's own — it is `WEBHOOK_PARAMS` after Jinja2 — so
 * unlike the other contexts' `normalize*` functions it does not vary with the API
 * version and takes none.
 */
export function normalizeTriggerEvent(payload: unknown): TriggerEventPayload {
	const raw = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
		string,
		unknown
	>;
	const docId = Number.parseInt(String(raw.docId ?? ''), 10);

	return {
		event: text(raw.event) ?? 'unknown',
		...(Number.isInteger(docId) && docId > 0 ? { docId } : {}),
		...pick('title', text(raw.title)),
		...pick('url', text(raw.url)),
		...pick('correspondent', text(raw.correspondent)),
		...pick('documentType', text(raw.documentType)),
		...pick('owner', text(raw.owner)),
		...pick('added', text(raw.added)),
		...pick('filename', text(raw.filename)),
	};
}

/**
 * `Workflow.name` is declared unique in `src/documents/models.py`, and n8n runs
 * the same lifecycle hooks for the test webhook as for the production one — so a
 * "Listen for test event" next to an active trigger would collide on the name
 * without the suffix. The webhook ID keeps two copies of the node apart; it is
 * truncated only to keep the name readable in the Paperless UI.
 */
export function workflowName(nodeName: string, webhookId: string, isTest: boolean): string {
	return `n8n ${nodeName} (${webhookId.slice(0, 8)})${isTest ? ' [test]' : ''}`;
}
