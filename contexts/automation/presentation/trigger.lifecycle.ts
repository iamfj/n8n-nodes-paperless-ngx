import type { IDataObject, IHookFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { chosenIds, isChosen } from '../../../shared/domain/load-options';
import type { PaperlessClient } from '../../../shared/infrastructure/paperless-client';
import {
	isTriggerEvent,
	matchesSpec,
	type TriggerFilters,
	type TriggerSpec,
	webhookWorkflowBody,
	workflowName,
} from '../domain/workflow';

/**
 * What the node remembers between activation and deactivation. The signature is
 * kept because the webhook has to compare against the exact value Paperless was
 * handed, and only the create hook ever sees it.
 */
export type TriggerState = {
	workflowId: number;
	triggerIds: number[];
	actionIds: number[];
	url: string;
	signature: string;
};

/**
 * The webhook reads the stored signature too, and it holds an `IWebhookFunctions`
 * rather than an `IHookFunctions` — these two members are what both have and all
 * the state needs.
 */
type StateContext = Pick<IHookFunctions, 'getMode' | 'getWorkflowStaticData'>;

// Test and production activations both run these hooks, against two different
// URLs and two different Paperless workflows, so they cannot share one slot.
function stateKey(isTest: boolean): string {
	return isTest ? 'paperlessWorkflowTest' : 'paperlessWorkflow';
}

function isTestRun(ctx: StateContext): boolean {
	return ctx.getMode() === 'manual';
}

export function readState(ctx: StateContext): TriggerState | undefined {
	const stored = ctx.getWorkflowStaticData('node')[stateKey(isTestRun(ctx))];
	if (typeof stored !== 'object' || stored === null) {
		return undefined;
	}
	const state = stored as Partial<TriggerState>;
	return typeof state.workflowId === 'number' ? (stored as TriggerState) : undefined;
}

function writeState(ctx: IHookFunctions, state: TriggerState | undefined): void {
	const staticData = ctx.getWorkflowStaticData('node');
	if (state === undefined) {
		delete staticData[stateKey(isTestRun(ctx))];
		return;
	}
	staticData[stateKey(isTestRun(ctx))] = state as unknown as IDataObject;
}

function optionalId(raw: unknown): number | undefined {
	const id = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
	return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined;
}

function toFilters(raw: IDataObject): TriggerFilters {
	const filters: TriggerFilters = {};
	const tags = chosenIds(raw.tags);
	if (tags?.length) {
		filters.tags = tags;
	}
	if (isChosen(raw.correspondent)) {
		filters.correspondent = optionalId(raw.correspondent);
	}
	if (isChosen(raw.documentType)) {
		filters.documentType = optionalId(raw.documentType);
	}
	if (typeof raw.filename === 'string' && raw.filename.length > 0) {
		filters.filename = raw.filename;
	}
	return filters;
}

function triggerSpec(ctx: IHookFunctions, signature: string): TriggerSpec {
	const url = ctx.getNodeWebhookUrl('default');
	if (url === undefined) {
		throw new NodeOperationError(ctx.getNode(), 'n8n did not provide a webhook URL for this node');
	}

	const event = String(ctx.getNodeParameter('event', 'documentAdded'));
	const node = ctx.getNode();

	return {
		// The node's own webhook ID, which n8n keeps stable across renames — the
		// name is only in there to make the row recognisable in Paperless.
		name: workflowName(node.name, node.webhookId ?? node.id, isTestRun(ctx)),
		event: isTriggerEvent(event) ? event : 'documentAdded',
		url,
		signature,
		filters: toFilters(ctx.getNodeParameter('filters', {}) as IDataObject),
	};
}

function ids(rows: unknown): number[] {
	return Array.isArray(rows)
		? rows.map((row) => (row as { id?: unknown }).id).filter((id): id is number => id !== undefined)
		: [];
}

/**
 * Deleting the Workflow leaves its triggers and actions behind: they hang off it
 * through a many-to-many relation, and Django only removes the join rows
 * (https://docs.djangoproject.com/en/5.1/ref/models/relations/). Each row is
 * deleted on its own, and a 404 from a Paperless release that does cascade them
 * is exactly as good an outcome as a 204.
 */
async function removeWorkflow(client: PaperlessClient, state: TriggerState): Promise<void> {
	const paths = [
		`/api/workflows/${state.workflowId}/`,
		...state.triggerIds.map((id) => `/api/workflow_triggers/${id}/`),
		...state.actionIds.map((id) => `/api/workflow_actions/${id}/`),
	];
	for (const path of paths) {
		await client
			.request<unknown>({ method: 'DELETE', path })
			// Nothing downstream can act on a failed cleanup, and letting it through
			// would leave the n8n workflow un-deactivatable with a stale row it can
			// no longer reach. `.catch()` rather than try/catch: a throw inside a
			// catch block is rejected outside `*.node.ts`.
			.catch(() => undefined);
	}
}

export async function createTriggerWorkflow(
	ctx: IHookFunctions,
	client: PaperlessClient,
): Promise<boolean> {
	// A workflow left over from drift or from a failed delete still holds the
	// name, which is unique in Paperless, so the POST below would answer 400.
	const stale = readState(ctx);
	if (stale !== undefined) {
		await removeWorkflow(client, stale);
	}

	const spec = triggerSpec(ctx, crypto.randomUUID());
	const created = await client.request<{ id: number; triggers?: unknown; actions?: unknown }>({
		method: 'POST',
		path: '/api/workflows/',
		body: webhookWorkflowBody(spec),
	});

	writeState(ctx, {
		workflowId: created.id,
		triggerIds: ids(created.triggers),
		actionIds: ids(created.actions),
		url: spec.url,
		signature: spec.signature,
	});
	return true;
}

export async function triggerWorkflowExists(
	ctx: IHookFunctions,
	client: PaperlessClient,
): Promise<boolean> {
	const state = readState(ctx);
	if (state === undefined) {
		return false;
	}

	// Anything that is not a readable workflow — a 404 after somebody deleted it in
	// Paperless, a token that lost workflow access — is answered with false so n8n
	// runs the create hook, where the same failure surfaces with its own message.
	const workflow = await client
		.request<unknown>({ method: 'GET', path: `/api/workflows/${state.workflowId}/` })
		.catch(() => undefined);

	return workflow !== undefined && matchesSpec(workflow, triggerSpec(ctx, state.signature));
}

export async function deleteTriggerWorkflow(
	ctx: IHookFunctions,
	client: PaperlessClient,
): Promise<boolean> {
	const state = readState(ctx);
	if (state !== undefined) {
		await removeWorkflow(client, state);
	}
	writeState(ctx, undefined);
	return true;
}
