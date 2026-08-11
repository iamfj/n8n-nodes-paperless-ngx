import type { IHttpRequestOptions } from 'n8n-workflow';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import {
	detailError,
	documentsPageV10,
	fieldValidationError,
	headersV9,
	headersV10,
	profile,
	versionMismatchError,
} from './fixtures/paperless';

type ClientModule = typeof import('../shared/infrastructure/paperless-client');
type ErrorModule = typeof import('../shared/domain/paperless-error');

let createClient: ClientModule['createClient'];
let normalizeBaseUrl: ClientModule['normalizeBaseUrl'];
let PaperlessError: ErrorModule['PaperlessError'];

// The negotiated-version cache lives at module scope on purpose, so each test
// gets a fresh module registry rather than a reset hatch in shipped code.
beforeEach(async () => {
	vi.resetModules();
	({ createClient, normalizeBaseUrl } = await import('../shared/infrastructure/paperless-client'));
	({ PaperlessError } = await import('../shared/domain/paperless-error'));
});

const ok = (body: unknown, headers: Record<string, string> = headersV10) => ({
	statusCode: 200,
	headers,
	body,
});

const notAcceptable = () => ({
	statusCode: 406,
	headers: headersV9,
	body: versionMismatchError,
});

type Http = ReturnType<typeof createFakeExecuteFunctions>['http'];

const optionsOf = (http: Http, call = 0) => http.mock.calls[call][1] as IHttpRequestOptions;
const acceptOf = (http: Http, call = 0) =>
	(optionsOf(http, call).headers as Record<string, string>).Accept;

describe('normalizeBaseUrl', () => {
	it('strips trailing slashes and surrounding whitespace', () => {
		expect(normalizeBaseUrl(' https://paperless.example.com/// ')).toBe(
			'https://paperless.example.com',
		);
	});

	it('leaves an /api suffix alone, so the 404 hint can name it', () => {
		expect(normalizeBaseUrl('https://paperless.example.com/api')).toBe(
			'https://paperless.example.com/api',
		);
	});
});

describe('request options', () => {
	it('asks for the preferred version without probing first', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue(ok(profile));

		const client = await createClient(ctx);
		await client.request({ method: 'GET', path: '/api/profile/' });

		expect(http).toHaveBeenCalledTimes(1);
		expect(acceptOf(http)).toBe('application/json; version=10');
		expect(optionsOf(http).url).toBe('https://paperless.example.com/api/profile/');
	});

	it('reads status and version itself instead of letting n8n throw', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue(ok(profile));

		await (await createClient(ctx)).request({ method: 'GET', path: '/api/profile/' });

		expect(optionsOf(http)).toMatchObject({
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			skipSslCertificateValidation: false,
			json: true,
		});
	});

	it('serializes list filters as repeated keys and drops empty ones', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue(ok(documentsPageV10));

		await (await createClient(ctx)).requestPage({
			method: 'GET',
			path: '/api/documents/',
			qs: { tags__id__all: [5, 8], title: undefined, page: 1 },
		});

		expect(optionsOf(http).arrayFormat).toBe('repeat');
		expect(optionsOf(http).qs).toEqual({ tags__id__all: [5, 8], page: 1 });
	});

	it('passes the credential SSL toggle through', async () => {
		const { ctx, http } = createFakeExecuteFunctions({
			credentials: { ignoreSslIssues: true },
		});
		http.mockResolvedValue(ok(profile));

		await (await createClient(ctx)).request({ method: 'GET', path: '/api/profile/' });

		expect(optionsOf(http).skipSslCertificateValidation).toBe(true);
	});

	it('sends a FormData body untouched: no Content-Type, no json flag', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue(ok('uuid-of-the-consumption-task'));

		const form = new FormData();
		form.append('title', 'Invoice');
		await (await createClient(ctx)).request({
			method: 'POST',
			path: '/api/documents/post_document/',
			form,
		});

		const options = optionsOf(http);
		expect(options.body).toBe(form);
		expect(options.json).toBeUndefined();
		expect(Object.keys(options.headers as Record<string, string>)).toEqual(['Accept']);
	});
});

describe('version negotiation', () => {
	it('retries a 406 with the next lower version under Auto', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValueOnce(notAcceptable()).mockResolvedValueOnce(ok(profile, headersV9));

		const client = await createClient(ctx);
		await client.request({ method: 'GET', path: '/api/profile/' });

		expect(http).toHaveBeenCalledTimes(2);
		expect(acceptOf(http, 0)).toBe('application/json; version=10');
		expect(acceptOf(http, 1)).toBe('application/json; version=9');
		expect(await client.version()).toBe(9);
	});

	it('replays a POST after a 406 with method and body intact', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValueOnce(notAcceptable()).mockResolvedValueOnce(ok({ id: 7 }, headersV9));

		const body = { title: 'Invoice 2026-04', tags: [5, 8] };
		await (await createClient(ctx)).request({ method: 'POST', path: '/api/documents/', body });

		expect(http).toHaveBeenCalledTimes(2);
		expect(optionsOf(http, 1)).toMatchObject({ method: 'POST', json: true });
		expect(optionsOf(http, 1).body).toBe(body);
		expect(optionsOf(http, 1).body).toEqual(optionsOf(http, 0).body);
	});

	it('never downgrades a pinned version, and reports the mismatch instead', async () => {
		const { ctx, http } = createFakeExecuteFunctions({ credentials: { apiVersion: '9' } });
		http.mockResolvedValue(notAcceptable());

		const client = await createClient(ctx);
		const failure = client.request({ method: 'GET', path: '/api/profile/' });

		await expect(failure).rejects.toBeInstanceOf(PaperlessError);
		await expect(failure).rejects.toMatchObject({ kind: 'unsupportedApiVersion', status: 406 });
		expect(http).toHaveBeenCalledTimes(1);
		expect(acceptOf(http)).toBe('application/json; version=9');
		expect(await client.version()).toBe(9);
	});

	it('reports the preferred version under Auto before anything has been negotiated', async () => {
		const { ctx } = createFakeExecuteFunctions();
		expect(await (await createClient(ctx)).version()).toBe(10);
	});

	it('shares the negotiated version across clients for the same base URL', async () => {
		const first = createFakeExecuteFunctions();
		first.http.mockResolvedValueOnce(notAcceptable()).mockResolvedValueOnce(ok(profile, headersV9));
		await (await createClient(first.ctx)).request({ method: 'GET', path: '/api/profile/' });

		const second = createFakeExecuteFunctions();
		second.http.mockResolvedValue(ok(profile, headersV9));
		const client = await createClient(second.ctx);
		await client.request({ method: 'GET', path: '/api/profile/' });

		expect(second.http).toHaveBeenCalledTimes(1);
		expect(acceptOf(second.http)).toBe('application/json; version=9');
		expect(await client.version()).toBe(9);
	});

	it('keeps the cache per base URL, since versions belong to the server', async () => {
		const first = createFakeExecuteFunctions();
		first.http.mockResolvedValueOnce(notAcceptable()).mockResolvedValueOnce(ok(profile, headersV9));
		await (await createClient(first.ctx)).request({ method: 'GET', path: '/api/profile/' });

		const other = createFakeExecuteFunctions({
			credentials: { baseUrl: 'https://docs.other.example.com' },
		});
		other.http.mockResolvedValue(ok(profile));
		await (await createClient(other.ctx)).request({ method: 'GET', path: '/api/profile/' });

		expect(acceptOf(other.http)).toBe('application/json; version=10');
	});

	it('heals a stale cache when the server stops serving the cached version', async () => {
		const first = createFakeExecuteFunctions();
		first.http.mockResolvedValueOnce(notAcceptable()).mockResolvedValueOnce(ok(profile, headersV9));
		await (await createClient(first.ctx)).request({ method: 'GET', path: '/api/profile/' });

		const upgraded = createFakeExecuteFunctions();
		upgraded.http
			.mockResolvedValueOnce({ statusCode: 406, headers: headersV10, body: versionMismatchError })
			.mockResolvedValueOnce(ok(profile, headersV10));
		const client = await createClient(upgraded.ctx);
		await client.request({ method: 'GET', path: '/api/profile/' });

		expect(acceptOf(upgraded.http, 0)).toBe('application/json; version=9');
		expect(acceptOf(upgraded.http, 1)).toBe('application/json; version=10');
		expect(await client.version()).toBe(10);
	});
});

describe('responses', () => {
	it('reduces a list response to a Page', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue(ok(documentsPageV10));

		const page = await (await createClient(ctx)).requestPage({
			method: 'GET',
			path: '/api/documents/',
		});

		expect(page).toEqual({ items: documentsPageV10.results, count: 31, hasMore: true });
	});

	it('refuses a body that is not a paginated list', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue(ok(profile));

		await expect(
			(await createClient(ctx)).requestPage({ method: 'GET', path: '/api/profile/' }),
		).rejects.toThrow(/paginated/);
	});

	it.each([
		['a Buffer', Buffer.from('%PDF-1.7')],
		['an ArrayBuffer', new Uint8Array(Buffer.from('%PDF-1.7')).buffer],
	])('normalizes a binary body given as %s', async (_label, body) => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue({
			statusCode: 200,
			headers: {
				...headersV10,
				'content-type': 'application/pdf',
				'content-disposition': 'attachment; filename="invoice.pdf"',
			},
			body,
		});

		const download = await (await createClient(ctx)).requestBinary({
			method: 'GET',
			path: '/api/documents/42/download/',
		});

		expect(Buffer.isBuffer(download.data)).toBe(true);
		expect(download.data.toString()).toBe('%PDF-1.7');
		expect(download).toMatchObject({ mimeType: 'application/pdf', fileName: 'invoice.pdf' });
		expect(optionsOf(http).encoding).toBe('arraybuffer');
		expect(optionsOf(http).json).toBeUndefined();
	});
});

describe('failures', () => {
	it('turns a 401 into an unauthorized PaperlessError carrying the scheme hint', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue({
			statusCode: 401,
			headers: headersV10,
			body: { detail: 'Invalid token.' },
		});

		const failure = (await createClient(ctx)).request({ method: 'GET', path: '/api/profile/' });

		await expect(failure).rejects.toBeInstanceOf(PaperlessError);
		await expect(failure).rejects.toMatchObject({
			kind: 'unauthorized',
			status: 401,
			method: 'GET',
			hint: expect.stringContaining('Token'),
		});
	});

	it('keeps DRF field errors on a 400', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue({ statusCode: 400, headers: headersV10, body: fieldValidationError });

		await expect(
			(await createClient(ctx)).request({ method: 'POST', path: '/api/documents/' }),
		).rejects.toMatchObject({ kind: 'validation', fieldErrors: fieldValidationError });
	});

	it('reports the server version it was told about on a 404', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue({ statusCode: 404, headers: headersV10, body: detailError });

		await expect(
			(await createClient(ctx)).request({ method: 'GET', path: '/api/documents/999/' }),
		).rejects.toMatchObject({ kind: 'notFound', serverApiVersion: 10, serverRelease: '3.0.5' });
	});

	it('wraps a transport failure without leaking the credential', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockRejectedValue(
			Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8000'), {
				config: { headers: { Authorization: 'Token test-token' } },
			}),
		);

		const failure = (await createClient(ctx)).request({ method: 'GET', path: '/api/profile/' });

		await expect(failure).rejects.toBeInstanceOf(PaperlessError);
		await failure.catch((error: InstanceType<typeof PaperlessError>) => {
			expect(error.kind).toBe('network');
			expect(error.status).toBe(0);
			expect(JSON.stringify(error)).not.toContain('test-token');
		});
	});
});
