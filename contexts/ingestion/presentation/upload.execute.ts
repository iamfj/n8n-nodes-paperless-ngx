import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';
import { chosenIds, locatorId } from '../../../shared/domain/load-options';
import { toBoolean } from '../../../shared/domain/parameters';
import { readBinaryInput, toFormData } from '../../../shared/infrastructure/binary';
import type { PaperlessClient } from '../../../shared/infrastructure/paperless-client';
import {
	type ConsumptionTask,
	isTerminal,
	normalizeConsumptionTask,
	readTaskId,
	toTaskList,
} from '../domain/consumption-task';

/**
 * Consumption is OCR, so the first poll is never going to succeed on a real
 * scan; the interval trades a little latency on a fast instance for far fewer
 * requests on a slow one. It is not user-configurable because the timeout is the
 * knob that actually matters.
 */
const POLL_INTERVAL_MS = 2000;

function optionalId(raw: unknown): number | undefined {
	const id = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
	return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined;
}

function optionalText(raw: unknown): string | undefined {
	return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * `created` is validated by Django's `DateField`, which answers 400 for the full
 * ISO 8601 timestamp an n8n `dateTime` property produces — the same reason
 * `contexts/archive/domain/document.ts` truncates it on PATCH.
 */
function optionalDate(raw: unknown): string | undefined {
	return optionalText(raw)?.slice(0, 10);
}

async function pollTask(
	client: PaperlessClient,
	taskId: string,
	timeoutMs: number,
): Promise<ConsumptionTask> {
	const deadline = Date.now() + timeoutMs;
	let task: ConsumptionTask | undefined;

	for (;;) {
		const version = await client.version();
		const body = await client.request<unknown>({
			method: 'GET',
			path: '/api/tasks/',
			qs: { task_id: taskId },
		});
		// An empty list right after the upload is normal rather than an error: the
		// worker has not necessarily written the task row yet. The whole list is
		// searched rather than its first entry: an instance that ignores `task_id`
		// answers with every unacknowledged task, and ours is rarely the first.
		const candidate = toTaskList(body)
			.map((entry) => normalizeConsumptionTask(version, entry))
			.find((entry) => entry.taskId === taskId);
		task = candidate ?? task;

		if (task && isTerminal(task.status)) {
			return task;
		}
		if (Date.now() >= deadline) {
			return task ?? { taskId, status: 'pending', raw: {} satisfies Record<string, unknown> };
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

export async function executeUpload(
	ctx: IExecuteFunctions,
	itemIndex: number,
	client: PaperlessClient,
): Promise<INodeExecutionData[]> {
	const binaryPropertyName = ctx.getNodeParameter(
		'binaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const waitForConsumption = toBoolean(
		ctx.getNodeParameter('waitForConsumption', itemIndex, true),
		true,
	);
	const fields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const file = await readBinaryInput(ctx, itemIndex, binaryPropertyName);

	const form = toFormData(
		{
			title: optionalText(fields.title),
			created: optionalDate(fields.created),
			correspondent: locatorId(fields.correspondent),
			document_type: locatorId(fields.documentType),
			storage_path: locatorId(fields.storagePath),
			archive_serial_number: optionalId(fields.archiveSerialNumber),
			tags: chosenIds(fields.tags),
		},
		{ document: file },
	);

	const response = await client.request<unknown>({
		method: 'POST',
		path: '/api/documents/post_document/',
		form,
	});
	const taskId = readTaskId(response);

	if (taskId === undefined) {
		// 200 with no UUID means the request reached something that is not
		// Paperless-ngx, or a version whose contract we do not know.
		throw new NodeOperationError(
			ctx.getNode(),
			'The upload was accepted but no Consumption task ID came back, so the document cannot be tracked',
			{
				itemIndex,
				description:
					"The response did not have the shape Paperless-ngx returns. Check that the credential's base URL is the instance root rather than a proxy or the web UI, and that the instance serves API version 9 or 10.",
			},
		);
	}

	if (!waitForConsumption) {
		return [{ json: { taskId, status: 'pending' }, pairedItem: { item: itemIndex } }];
	}

	const timeout = ctx.getNodeParameter('timeout', itemIndex, 300) as number;
	const task = await pollTask(client, taskId, Math.max(0, timeout) * 1000);

	if (task.status === 'failure' || task.status === 'revoked') {
		throw new NodeOperationError(
			ctx.getNode(),
			`Paperless-ngx could not consume the file (${task.status}): ${task.message ?? 'no reason reported'}`,
			{
				itemIndex,
				description: `Open Paperless-ngx and look up task ${taskId} under File Tasks for the full log. An unsupported file type and a duplicate of an existing document both end here.`,
			},
		);
	}
	if (!isTerminal(task.status)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Consumption of task ${taskId} did not finish within ${timeout} seconds`,
			{
				itemIndex,
				description:
					'Consumption may still complete on the server. Raise Timeout (Seconds), or turn off Wait for Consumption and look the task up in a later step.',
			},
		);
	}
	if (task.documentId === undefined) {
		// A duplicate is reported as SUCCESS with no document: Paperless-ngx
		// consumed nothing and there is no ID to fetch.
		return [
			{
				json: { taskId, status: task.status, message: task.message, task: task.raw },
				pairedItem: { item: itemIndex },
			},
		];
	}

	const document = await client.request<IDataObject>({
		method: 'GET',
		path: `/api/documents/${task.documentId}/`,
	});
	return [{ json: { ...document, taskId }, pairedItem: { item: itemIndex } }];
}
