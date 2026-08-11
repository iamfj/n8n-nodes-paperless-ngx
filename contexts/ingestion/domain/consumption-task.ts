import type { ApiVersion } from '../../../shared/domain/api-version';
import { supports } from '../../../shared/domain/api-version';

/**
 * v9 hands back Celery's uppercase states; v10 stores lowercase ones on
 * `PaperlessTask.Status`. Normalized to the lowercase set, which is the one that
 * survives — the v9 names exist only in the compatibility serializer.
 */
export type ConsumptionStatus = 'pending' | 'started' | 'success' | 'failure' | 'revoked';

export type ConsumptionTask = {
	taskId: string;
	status: ConsumptionStatus;
	/** The consumed document, present only once the task succeeded. */
	documentId?: number;
	/** The failure message, or whatever the task chose to report on success. */
	message?: string;
	/** The task as the server sent it, so nothing is lost by normalizing. */
	raw: Record<string, unknown>;
};

const STATUSES: readonly ConsumptionStatus[] = [
	'pending',
	'started',
	'success',
	'failure',
	'revoked',
];

const TERMINAL_STATUSES: readonly ConsumptionStatus[] = ['success', 'failure', 'revoked'];

export function isTerminal(status: ConsumptionStatus): boolean {
	return TERMINAL_STATUSES.includes(status);
}

function toStatus(raw: unknown): ConsumptionStatus {
	const value = typeof raw === 'string' ? raw.toLowerCase() : '';
	return (STATUSES as readonly string[]).includes(value)
		? (value as ConsumptionStatus)
		: // An unknown state is treated as still running rather than as a failure:
			// the caller's timeout is the safe way out, and inventing a terminal
			// state here would drop a document that did in fact get consumed.
			'pending';
}

function firstInteger(raw: unknown): number | undefined {
	if (typeof raw === 'number' && Number.isInteger(raw)) {
		return raw;
	}
	if (Array.isArray(raw)) {
		const first = raw.find((entry) => Number.isInteger(entry));
		return typeof first === 'number' ? first : undefined;
	}
	return undefined;
}

function messageFrom(raw: Record<string, unknown>): string | undefined {
	// v9 puts the human-readable outcome in `result`; v10 replaced it with the
	// structured `result_data`, whose error key is the only part worth surfacing.
	if (typeof raw.result === 'string' && raw.result.length > 0) {
		return raw.result;
	}
	const data = raw.result_data;
	if (typeof data !== 'object' || data === null) {
		return undefined;
	}
	for (const key of ['error', 'message', 'detail']) {
		const value = (data as Record<string, unknown>)[key];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}
	return undefined;
}

export function normalizeConsumptionTask(version: ApiVersion, raw: unknown): ConsumptionTask {
	const task = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	// v10 renamed `related_document` (a single ID) to `related_document_ids` (a
	// list). Reading both by capability keeps the field names honest; reading the
	// other one as a fallback would hide a genuine negotiation bug.
	const documentId = supports(version, 'redesignedTasks')
		? firstInteger(task.related_document_ids)
		: firstInteger(task.related_document);

	return {
		taskId: typeof task.task_id === 'string' ? task.task_id : '',
		status: toStatus(task.status),
		documentId,
		message: messageFrom(task),
		raw: task,
	};
}

/**
 * v10 paginates `/api/tasks/`; v9 answers with a bare array. Both shapes are
 * read without consulting the version, because the client negotiates per request
 * and may have fallen back between the upload and this poll — and getting it
 * wrong here means waiting out the full timeout on a document that arrived.
 */
export function toTaskList(body: unknown): unknown[] {
	if (Array.isArray(body)) {
		return body;
	}
	if (
		typeof body === 'object' &&
		body !== null &&
		Array.isArray((body as { results?: unknown[] }).results)
	) {
		return (body as { results: unknown[] }).results;
	}
	return [];
}

/**
 * `post_document/` answers 200 with the task UUID as the *whole* body — a bare
 * JSON string, not an object — so it is read positionally rather than by key.
 */
export function readTaskId(body: unknown): string | undefined {
	if (typeof body === 'string' && body.trim().length > 0) {
		return body.trim().replace(/^"|"$/g, '');
	}
	if (typeof body === 'object' && body !== null) {
		const id = (body as { task_id?: unknown }).task_id;
		if (typeof id === 'string' && id.length > 0) {
			return id;
		}
	}
	return undefined;
}
