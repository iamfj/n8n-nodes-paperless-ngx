import type { IHttpRequestOptions } from 'n8n-workflow';
import { executeUpload } from '../contexts/ingestion/presentation/upload.execute';
import { createClient } from '../shared/infrastructure/paperless-client';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import { headersV9, headersV10 } from './fixtures/paperless';

const TASK_ID = '2b0e4a1c-0000-4000-8000-000000000000';

const ok = (body: unknown, headers: Record<string, string> = headersV10) => ({
	statusCode: 200,
	headers,
	body,
});

type Fake = ReturnType<typeof createFakeExecuteFunctions>;
const optionsOf = (http: Fake['http'], call = 0) => http.mock.calls[call][1] as IHttpRequestOptions;

// Every test either succeeds on the first poll or has a zero timeout, so the
// poll loop never sleeps and the suite needs no fake timers.
const upload = (parameters: Record<string, unknown> = {}, apiVersion: 'auto' | 9 | 10 = 'auto') =>
	createFakeExecuteFunctions({
		credentials: { apiVersion },
		parameters: {
			binaryPropertyName: 'data',
			waitForConsumption: true,
			timeout: 0,
			additionalFields: {},
			...parameters,
		},
	});

async function run(fake: Fake) {
	const client = await createClient(fake.ctx);
	return await executeUpload(fake.ctx, 0, client);
}

describe('upload execute', () => {
	it('posts the file as multipart with the metadata as form fields', async () => {
		const fake = upload({
			waitForConsumption: false,
			additionalFields: { title: 'Invoice', correspondent: 3, tags: [5, 8] },
		});
		fake.http.mockResolvedValue(ok(TASK_ID));

		await run(fake);

		const options = optionsOf(fake.http);
		expect(options.url).toBe('https://paperless.example.com/api/documents/post_document/');
		const form = options.body as FormData;
		expect(form).toBeInstanceOf(FormData);
		expect(form.get('title')).toBe('Invoice');
		expect(form.get('correspondent')).toBe('3');
		// Repeated keys rather than a JSON array: DRF reads these with getlist().
		expect(form.getAll('tags')).toEqual(['5', '8']);
		expect(form.get('document')).toBeInstanceOf(Blob);
		// Setting either of these would break the multipart body.
		expect(options.json).toBeUndefined();
		expect(options.headers).not.toHaveProperty('Content-Type');
	});

	it('truncates created to a date, which is all Django DateField accepts', async () => {
		const fake = upload({
			waitForConsumption: false,
			additionalFields: { created: '2026-04-01T18:02:57.104Z' },
		});
		fake.http.mockResolvedValue(ok(TASK_ID));

		await run(fake);

		expect((optionsOf(fake.http).body as FormData).get('created')).toBe('2026-04-01');
	});

	it('returns the task ID without polling when the wait is switched off', async () => {
		const fake = upload({ waitForConsumption: false });
		fake.http.mockResolvedValue(ok(TASK_ID));

		const result = await run(fake);

		expect(fake.http).toHaveBeenCalledTimes(1);
		expect(result[0].json).toEqual({ taskId: TASK_ID, status: 'pending' });
	});

	it('reads a stringified wait toggle as the boolean it means', async () => {
		// An expression delivers `'false'`, which is truthy: read as-is the node
		// would poll for the whole timeout with the wait switched off.
		const fake = upload({ waitForConsumption: 'false' });
		fake.http.mockResolvedValue(ok(TASK_ID));

		const result = await run(fake);

		expect(fake.http).toHaveBeenCalledTimes(1);
		expect(result[0].json).toEqual({ taskId: TASK_ID, status: 'pending' });
	});

	it('polls the task and returns the document it produced', async () => {
		const fake = upload();
		fake.http
			.mockResolvedValueOnce(ok(TASK_ID))
			.mockResolvedValueOnce(
				ok({
					count: 1,
					next: null,
					previous: null,
					results: [{ task_id: TASK_ID, status: 'success', related_document_ids: [42] }],
				}),
			)
			.mockResolvedValueOnce(ok({ id: 42, title: 'Invoice' }));

		const result = await run(fake);

		expect(optionsOf(fake.http, 1).url).toBe('https://paperless.example.com/api/tasks/');
		expect(optionsOf(fake.http, 1).qs).toMatchObject({ task_id: TASK_ID });
		expect(optionsOf(fake.http, 2).url).toBe('https://paperless.example.com/api/documents/42/');
		expect(result[0].json).toEqual({ id: 42, title: 'Invoice', taskId: TASK_ID });
	});

	it('reads the bare task array and single related_document a v9 server returns', async () => {
		// Pinned to 9, because a task normalized under the wrong version reads the
		// wrong field name and loses the document the upload actually produced.
		const fake = upload({}, 9);
		fake.http
			.mockResolvedValueOnce(ok(TASK_ID, headersV9))
			.mockResolvedValueOnce(
				ok([{ task_id: TASK_ID, status: 'SUCCESS', related_document: 42 }], headersV9),
			)
			.mockResolvedValueOnce(ok({ id: 42 }, headersV9));

		const result = await run(fake);

		expect(result[0].json).toMatchObject({ id: 42, taskId: TASK_ID });
	});

	it('fails with the reason Paperless reported when Consumption fails', async () => {
		const fake = upload();
		fake.http.mockResolvedValueOnce(ok(TASK_ID)).mockResolvedValueOnce(
			ok({
				count: 1,
				next: null,
				previous: null,
				results: [
					{ task_id: TASK_ID, status: 'failure', result_data: { error: 'unsupported file type' } },
				],
			}),
		);

		await expect(run(fake)).rejects.toThrow('unsupported file type');
	});

	it('fails rather than hanging when the task is still running at the deadline', async () => {
		const fake = upload();
		fake.http.mockResolvedValueOnce(ok(TASK_ID)).mockResolvedValue(
			ok({
				count: 1,
				next: null,
				previous: null,
				results: [{ task_id: TASK_ID, status: 'pending' }],
			}),
		);

		await expect(run(fake)).rejects.toThrow('did not finish within 0 seconds');
	});

	it('returns the task instead of a document when Consumption produced none', async () => {
		// What a duplicate looks like: the task succeeds, nothing was consumed.
		const fake = upload();
		fake.http.mockResolvedValueOnce(ok(TASK_ID)).mockResolvedValueOnce(
			ok({
				count: 1,
				next: null,
				previous: null,
				results: [
					{
						task_id: TASK_ID,
						status: 'success',
						related_document_ids: [],
						result_data: { message: 'It is a duplicate' },
					},
				],
			}),
		);

		const result = await run(fake);

		expect(fake.http).toHaveBeenCalledTimes(2);
		expect(result[0].json).toMatchObject({ taskId: TASK_ID, message: 'It is a duplicate' });
	});

	it('ignores a task that is not the one this upload created', async () => {
		// An instance that drops the `task_id` filter answers with the whole
		// unacknowledged list, whose newest entry belongs to another upload.
		const fake = upload();
		fake.http.mockResolvedValueOnce(ok(TASK_ID)).mockResolvedValue(
			ok({
				count: 1,
				next: null,
				previous: null,
				results: [{ task_id: 'someone-else', status: 'success', related_document_ids: [99] }],
			}),
		);

		await expect(run(fake)).rejects.toThrow('did not finish within 0 seconds');
	});

	it('finds its own task behind the other entries of an unfiltered list', async () => {
		const fake = upload();
		fake.http.mockResolvedValueOnce(ok(TASK_ID)).mockResolvedValueOnce(
			ok({
				count: 2,
				next: null,
				previous: null,
				results: [
					{ task_id: 'someone-else', status: 'started' },
					{ task_id: TASK_ID, status: 'success', related_document_ids: [42] },
				],
			}),
		);
		fake.http.mockResolvedValueOnce(ok({ id: 42, title: 'Invoice' }));

		const result = await run(fake);

		expect(result[0].json).toMatchObject({ id: 42, taskId: TASK_ID });
	});

	it('drops a tag the truncation notice contributed rather than sending it', async () => {
		const fake = upload({
			waitForConsumption: false,
			additionalFields: { tags: [5, '__truncated__', 8] },
		});
		fake.http.mockResolvedValue(ok(TASK_ID));

		await run(fake);

		expect((optionsOf(fake.http).body as FormData).getAll('tags')).toEqual(['5', '8']);
	});

	it('fails when the upload is accepted but no task ID comes back', async () => {
		const fake = upload();
		fake.http.mockResolvedValue(ok({ detail: 'ok' }));

		await expect(run(fake)).rejects.toThrow('no Consumption task ID');
	});
});
