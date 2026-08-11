import {
	isTerminal,
	normalizeConsumptionTask,
	readTaskId,
	toTaskList,
} from '../contexts/ingestion/domain/consumption-task';

/**
 * Field names come from the upstream task serializers:
 *   v9  — TaskSerializerV9:  task_name, type, related_document, result
 *   v10 — TaskSerializerV10: task_type, trigger_source, related_document_ids, result_data
 * and the status casing differs with them: v9 replays Celery's uppercase states,
 * v10 stores `PaperlessTask.Status` lowercase.
 */
const taskV9 = {
	id: 1,
	task_id: '2b0e4a1c-0000-4000-8000-000000000000',
	task_name: 'consume_file',
	task_file_name: 'invoice.pdf',
	type: 'auto_task',
	status: 'SUCCESS',
	date_created: '2026-04-01T18:02:57.104Z',
	date_done: '2026-04-01T18:03:41.902Z',
	result: 'Success. New document id 42 created',
	acknowledged: false,
	related_document: 42,
};

const taskV10 = {
	id: 1,
	task_id: '2b0e4a1c-0000-4000-8000-000000000000',
	task_type: 'consume_file',
	trigger_source: 'api_upload',
	status: 'success',
	date_created: '2026-04-01T18:02:57.104Z',
	date_done: '2026-04-01T18:03:41.902Z',
	result_data: { document_id: 42 },
	related_document_ids: [42],
	acknowledged: false,
};

describe('normalizeConsumptionTask', () => {
	it('reads the v9 single related_document', () => {
		expect(normalizeConsumptionTask(9, taskV9)).toMatchObject({
			taskId: taskV9.task_id,
			status: 'success',
			documentId: 42,
		});
	});

	it('reads the v10 related_document_ids list', () => {
		expect(normalizeConsumptionTask(10, taskV10)).toMatchObject({
			taskId: taskV10.task_id,
			status: 'success',
			documentId: 42,
		});
	});

	it.each([
		['PENDING', 'pending'],
		['STARTED', 'started'],
		['FAILURE', 'failure'],
		['REVOKED', 'revoked'],
	] as const)('lowercases the v9 Celery state %s', (raw, expected) => {
		expect(normalizeConsumptionTask(9, { ...taskV9, status: raw }).status).toBe(expected);
	});

	it('treats an unrecognised state as still running, never as a failure', () => {
		expect(normalizeConsumptionTask(10, { ...taskV10, status: 'retrying' }).status).toBe('pending');
	});

	it('surfaces the v9 result string as the message', () => {
		expect(normalizeConsumptionTask(9, { ...taskV9, status: 'FAILURE' }).message).toBe(
			taskV9.result,
		);
	});

	it('surfaces the v10 result_data error as the message', () => {
		expect(
			normalizeConsumptionTask(10, {
				...taskV10,
				status: 'failure',
				result_data: { error: 'unsupported file type' },
			}).message,
		).toBe('unsupported file type');
	});

	it('reports no document when the task succeeded without producing one', () => {
		const duplicate = { ...taskV10, related_document_ids: [], result_data: {} };
		expect(normalizeConsumptionTask(10, duplicate).documentId).toBeUndefined();
	});

	it('keeps the raw task so normalizing loses nothing', () => {
		expect(normalizeConsumptionTask(10, taskV10).raw).toEqual(taskV10);
	});
});

describe('isTerminal', () => {
	it.each(['success', 'failure', 'revoked'] as const)('stops polling on %s', (status) => {
		expect(isTerminal(status)).toBe(true);
	});

	it.each(['pending', 'started'] as const)('keeps polling on %s', (status) => {
		expect(isTerminal(status)).toBe(false);
	});
});

describe('toTaskList', () => {
	it('reads the bare array v9 returns', () => {
		expect(toTaskList([taskV9])).toEqual([taskV9]);
	});

	it('reads the paginated envelope v10 returns', () => {
		expect(toTaskList({ count: 1, next: null, previous: null, results: [taskV10] })).toEqual([
			taskV10,
		]);
	});

	it('reads an unexpected body as no tasks rather than throwing', () => {
		expect(toTaskList(null)).toEqual([]);
	});
});

describe('readTaskId', () => {
	it('reads the bare string body post_document returns', () => {
		expect(readTaskId('2b0e4a1c-0000-4000-8000-000000000000')).toBe(
			'2b0e4a1c-0000-4000-8000-000000000000',
		);
	});

	it('strips the quotes left by a body parsed as raw JSON text', () => {
		expect(readTaskId('"2b0e4a1c-0000-4000-8000-000000000000"')).toBe(
			'2b0e4a1c-0000-4000-8000-000000000000',
		);
	});

	it('falls back to a task_id key if the body ever becomes an object', () => {
		expect(readTaskId({ task_id: 'abc' })).toBe('abc');
	});

	it('returns nothing for a body that carries no ID', () => {
		expect(readTaskId({ detail: 'ok' })).toBeUndefined();
		expect(readTaskId('  ')).toBeUndefined();
	});
});
