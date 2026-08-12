import type { IHttpRequestOptions } from 'n8n-workflow';
import { executeNote } from '../contexts/archive/presentation/note.execute';
import { createClient } from '../shared/infrastructure/paperless-client';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import { headersV10 } from './fixtures/paperless';

const ok = (body: unknown) => ({ statusCode: 200, headers: headersV10, body });

type Fake = ReturnType<typeof createFakeExecuteFunctions>;
const optionsOf = (http: Fake['http']) => http.mock.calls[0][1] as IHttpRequestOptions;

const notes = [
	{ id: 1, note: 'Paid on 2026-04-05', created: '2026-04-05T10:00:00Z', user: 1 },
	{ id: 2, note: 'Filed', created: '2026-04-06T10:00:00Z', user: 1 },
];

async function run(fake: Fake, operation: Parameters<typeof executeNote>[3]) {
	const client = await createClient(fake.ctx);
	return await executeNote(fake.ctx, 0, client, operation);
}

describe('note execute', () => {
	it('lists the notes on a document, one item each', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { documentId: { mode: 'list', value: '42' } },
		});
		fake.http.mockResolvedValue(ok(notes));

		const result = await run(fake, 'getMany');

		expect(optionsOf(fake.http).url).toBe('https://paperless.example.com/api/documents/42/notes/');
		expect(result).toHaveLength(2);
		// The endpoint returns no document reference, so it is added back — an item
		// carrying only `{id, note}` cannot be routed downstream.
		expect(result[0].json).toMatchObject({ id: 1, document: 42 });
	});

	it('posts the note text and returns the resulting list', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { documentId: { mode: 'list', value: '42' }, note: 'Filed' },
		});
		fake.http.mockResolvedValue(ok(notes));

		const result = await run(fake, 'create');

		expect(optionsOf(fake.http).method).toBe('POST');
		expect(optionsOf(fake.http).body).toEqual({ note: 'Filed' });
		expect(result).toHaveLength(2);
	});

	it('identifies the note to delete by query parameter, not by path', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { documentId: 42, noteId: 1 } });
		fake.http.mockResolvedValue(ok([notes[1]]));

		const result = await run(fake, 'delete');

		const options = optionsOf(fake.http);
		expect(options.method).toBe('DELETE');
		expect(options.url).toBe('https://paperless.example.com/api/documents/42/notes/');
		expect(options.qs).toMatchObject({ id: 1 });
		expect(result).toHaveLength(1);
		expect(result[0].json).toEqual({ id: 1, document: 42, deleted: true });
	});

	it('confirms the delete even when it emptied the document’s notes', async () => {
		const fake = createFakeExecuteFunctions({ parameters: { documentId: 42, noteId: 1 } });
		fake.http.mockResolvedValue(ok([]));

		const result = await run(fake, 'delete');

		expect(result).toHaveLength(1);
		expect(result[0].json).toEqual({ id: 1, document: 42, deleted: true });
	});

	it('does not lose an unexpected body shape', async () => {
		const fake = createFakeExecuteFunctions({
			parameters: { documentId: { mode: 'list', value: '42' } },
		});
		fake.http.mockResolvedValue(ok({ detail: 'Insufficient permissions' }));

		const result = await run(fake, 'getMany');

		expect(result[0].json).toMatchObject({ document: 42 });
	});
});
