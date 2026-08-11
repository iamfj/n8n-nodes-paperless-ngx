import {
	classify,
	extractDetail,
	extractFieldErrors,
	hintFor,
	PaperlessError,
} from '../shared/domain/paperless-error';
import { detailError, fieldValidationError, versionMismatchError } from './fixtures/paperless';

// Node's Error inspector prints `cause` even when it is non-enumerable, so the
// two defences below are what keeps a raised-depth logger from printing the
// axios request config. `util.inspect` itself cannot be called from here:
// `node:util`, `process` and `console` are all banned by the frozen n8n Cloud
// lint config, so the mechanism is asserted instead of its stdout.
const INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

const proxyHtml = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';

function contextOf(overrides: Partial<Parameters<typeof hintFor>[1]> = {}) {
	return {
		method: 'GET',
		url: 'https://paperless.example.com/api/documents/',
		status: 500,
		body: undefined,
		...overrides,
	};
}

describe('classify', () => {
	it.each([
		[0, 'network'],
		[400, 'validation'],
		[401, 'unauthorized'],
		[403, 'forbidden'],
		[404, 'notFound'],
		[406, 'unsupportedApiVersion'],
		[409, 'conflict'],
		[413, 'payloadTooLarge'],
		[422, 'validation'],
		[429, 'rateLimited'],
		[500, 'server'],
		[503, 'server'],
		[418, 'unknown'],
	])('maps status %i to %s', (status, kind) => {
		expect(classify(status, undefined)).toBe(kind);
	});

	it('treats an HTML body under an unmapped status as a proxy failure', () => {
		expect(classify(418, proxyHtml)).toBe('server');
	});
});

describe('body extraction', () => {
	it('reads DRF field errors', () => {
		expect(extractFieldErrors(fieldValidationError)).toEqual(fieldValidationError);
	});

	it('reads top-level non_field_errors and bare string values', () => {
		expect(extractFieldErrors({ non_field_errors: ['Nope.'], title: 'Too long.' })).toEqual({
			non_field_errors: ['Nope.'],
			title: ['Too long.'],
		});
	});

	it('ignores every DRF envelope key, which is not a form field', () => {
		expect(extractFieldErrors({ detail: 'x', code: 'permission_denied' })).toBeUndefined();
		expect(extractFieldErrors({ messages: ['x'], title: ['Too long.'] })).toEqual({
			title: ['Too long.'],
		});
	});

	it('ignores the detail envelope and non-object bodies', () => {
		expect(extractFieldErrors(detailError)).toBeUndefined();
		expect(extractFieldErrors(proxyHtml)).toBeUndefined();
		expect(extractFieldErrors(null)).toBeUndefined();
		expect(extractFieldErrors([1, 2])).toBeUndefined();
	});

	it('reads the detail envelope, a plain string body, and nothing from HTML', () => {
		expect(extractDetail(detailError)).toBe('Not found.');
		expect(extractDetail('Service unavailable')).toBe('Service unavailable');
		expect(extractDetail(proxyHtml)).toBeUndefined();
		expect(extractDetail({})).toBeUndefined();
	});
});

describe('hints', () => {
	it('names the requested version on a 406 and never claims to know the server one', () => {
		const hint = hintFor(
			'unsupportedApiVersion',
			contextOf({ status: 406, body: versionMismatchError, requestedApiVersion: 10 }),
		);
		expect(hint).toContain('10');
		expect(hint).toContain('Auto');
		// A 406 carries no version header, so a hint must never render one.
		expect(hint).not.toMatch(/unknown/i);
	});

	it('explains the proxy page instead of the version when a 406 body is HTML', () => {
		expect(classify(406, proxyHtml)).toBe('server');
		expect(hintFor('server', contextOf({ status: 406, body: proxyHtml }))).toMatch(/HTML/);
	});

	it('corrects the auth scheme on a 401', () => {
		expect(hintFor('unauthorized', contextOf({ status: 401 }))).toContain('Token');
	});

	it('points at object permissions on a 403 and at the /api suffix on a 404', () => {
		expect(hintFor('forbidden', contextOf({ status: 403 }))).toMatch(/permission/i);
		expect(hintFor('notFound', contextOf({ status: 404 }))).toContain('/api');
	});

	it('blames the proxy body limit on a 413 and surfaces Retry-After on a 429', () => {
		expect(hintFor('payloadTooLarge', contextOf({ status: 413 }))).toContain(
			'client_max_body_size',
		);
		expect(hintFor('rateLimited', contextOf({ status: 429, retryAfter: '30' }))).toContain('30');
	});

	it('explains an HTML body and a self-signed certificate', () => {
		expect(hintFor('server', contextOf({ status: 502, body: proxyHtml }))).toMatch(/HTML/);
		const ssl = hintFor(
			'network',
			contextOf({ status: 0, cause: new Error('self signed certificate in certificate chain') }),
		);
		expect(ssl).toContain('Ignore SSL Issues');
	});

	it('adds nothing to a 400, whose field errors already say it best', () => {
		expect(
			hintFor('validation', contextOf({ status: 400, body: fieldValidationError })),
		).toBeUndefined();
	});
});

describe('PaperlessError', () => {
	it('is a real Error and classifies itself from the response', () => {
		const error = new PaperlessError(contextOf({ status: 404, body: detailError }));
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('PaperlessError');
		expect(error.kind).toBe('notFound');
		expect(error.status).toBe(404);
		expect(error.message).toContain('Not found.');
		expect(error.message).toContain('https://paperless.example.com/api/documents/');
	});

	it('collects field errors into the message and the field map', () => {
		const error = new PaperlessError(
			contextOf({ method: 'POST', status: 400, body: fieldValidationError }),
		);
		expect(error.fieldErrors).toEqual(fieldValidationError);
		expect(error.message).toContain('This field may not be blank.');
	});

	it('carries the requested version of a 406 through to the hint', () => {
		const error = new PaperlessError(
			contextOf({ status: 406, body: versionMismatchError, requestedApiVersion: 10 }),
		);
		expect(error.kind).toBe('unsupportedApiVersion');
		expect(error.requestedApiVersion).toBe(10);
		expect(error.hint).toContain('10');
	});

	it('keeps the credential out of anything serialized', () => {
		const transportFailure = Object.assign(new Error('connect ECONNREFUSED'), {
			options: { headers: { Authorization: 'Token super-secret-value' } },
		});
		const error = new PaperlessError(contextOf({ status: 0, cause: transportFailure }));

		expect(error.kind).toBe('network');
		expect(error.cause).toBe(transportFailure);
		expect(JSON.stringify(error)).not.toContain('super-secret-value');
		expect(JSON.stringify(error)).not.toContain('Authorization');
		expect(JSON.stringify({ error })).not.toContain('super-secret-value');
		expect(error.toJSON()).toMatchObject({ kind: 'network', status: 0 });
	});

	it('keeps the credential out of util.inspect, which prints cause even when hidden', () => {
		const transportFailure = Object.assign(new Error('socket hang up'), {
			config: { headers: { Authorization: 'Token super-secret-value' } },
		});
		const error = new PaperlessError(contextOf({ status: 0, cause: transportFailure }));

		// The inspector reads a data property but renders an accessor as [Getter].
		const descriptor = Object.getOwnPropertyDescriptor(error, 'cause');
		expect(descriptor?.value).toBeUndefined();
		expect(typeof descriptor?.get).toBe('function');

		// And an object with this hook is never formatted by the Error inspector.
		const hook = (error as unknown as Record<symbol, () => unknown>)[INSPECT_CUSTOM];
		expect(typeof hook).toBe('function');
		expect(hook.call(error)).toEqual(error.toJSON());
		expect(JSON.stringify(hook.call(error))).not.toContain('super-secret-value');

		// The debugging value of the cause is not given up, only its printing.
		expect(error.cause).toBe(transportFailure);
	});
});
