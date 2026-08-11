import type { ApiVersion } from './api-version';

export type PaperlessErrorKind =
	| 'unauthorized'
	| 'forbidden'
	| 'notFound'
	| 'validation'
	| 'unsupportedApiVersion'
	| 'payloadTooLarge'
	| 'rateLimited'
	| 'conflict'
	| 'server'
	| 'network'
	| 'unknown';

export type PaperlessErrorContext = {
	method: string;
	url: string;
	/** 0 when the request never produced a response at all. */
	status: number;
	body: unknown;
	/** Set only where the response body cannot explain the failure itself. */
	detail?: string;
	requestedApiVersion?: ApiVersion;
	serverApiVersion?: number;
	serverRelease?: string;
	retryAfter?: string;
	cause?: unknown;
};

const STATUS_KINDS: Record<number, PaperlessErrorKind> = {
	400: 'validation',
	401: 'unauthorized',
	403: 'forbidden',
	404: 'notFound',
	406: 'unsupportedApiVersion',
	409: 'conflict',
	413: 'payloadTooLarge',
	422: 'validation',
	429: 'rateLimited',
};

const KIND_SUMMARY: Record<PaperlessErrorKind, string> = {
	unauthorized: 'authentication failed',
	forbidden: 'access denied',
	notFound: 'not found',
	validation: 'request rejected',
	unsupportedApiVersion: 'API version not supported by this server',
	payloadTooLarge: 'payload too large',
	rateLimited: 'too many requests',
	conflict: 'conflict',
	server: 'Paperless-ngx returned a server error',
	network: 'Paperless-ngx could not be reached',
	unknown: 'unexpected response',
};

function isHtmlBody(body: unknown): boolean {
	return typeof body === 'string' && /^\s*<(!doctype|html)/i.test(body);
}

function causeMessage(cause: unknown): string | undefined {
	if (cause instanceof Error) {
		return cause.message;
	}
	return typeof cause === 'string' ? cause : undefined;
}

export function classify(status: number, body: unknown): PaperlessErrorKind {
	if (status === 0) {
		return 'network';
	}
	const known = STATUS_KINDS[status];
	if (known) {
		return known;
	}
	if (status >= 500) {
		return 'server';
	}
	// A proxy in front of Paperless can answer with its own HTML page under a
	// status Paperless itself never returns; that is a server-side failure, not
	// something the workflow did wrong.
	if (isHtmlBody(body)) {
		return 'server';
	}
	return 'unknown';
}

export function extractFieldErrors(body: unknown): Record<string, string[]> | undefined {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return undefined;
	}
	const fieldErrors: Record<string, string[]> = {};
	for (const [field, value] of Object.entries(body as Record<string, unknown>)) {
		if (field === 'detail') {
			continue;
		}
		if (typeof value === 'string') {
			fieldErrors[field] = [value];
			continue;
		}
		if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
			fieldErrors[field] = value as string[];
		}
	}
	return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

export function extractDetail(body: unknown): string | undefined {
	if (typeof body === 'string') {
		return isHtmlBody(body) || body.trim().length === 0 ? undefined : body.trim();
	}
	if (typeof body !== 'object' || body === null) {
		return undefined;
	}
	const detail = (body as { detail?: unknown }).detail;
	return typeof detail === 'string' && detail.length > 0 ? detail : undefined;
}

function formatFieldErrors(fieldErrors: Record<string, string[]>): string {
	return Object.entries(fieldErrors)
		.map(([field, messages]) => `${field}: ${messages.join(' ')}`)
		.join('; ');
}

export function hintFor(
	kind: PaperlessErrorKind,
	context: PaperlessErrorContext,
): string | undefined {
	if (kind === 'unsupportedApiVersion') {
		const requested = context.requestedApiVersion ?? 'unknown';
		const server = context.serverApiVersion ?? 'unknown';
		const release = context.serverRelease ? ` (Paperless-ngx ${context.serverRelease})` : '';
		return `Requested API version ${requested}, but the server reports version ${server}${release}. Set API Version to Auto in the credential, or pin a version this server serves.`;
	}
	if (kind === 'network') {
		const message = causeMessage(context.cause) ?? '';
		if (/self.signed|self_signed|DEPTH_ZERO|UNABLE_TO_VERIFY|CERT_/i.test(message)) {
			return 'The TLS certificate could not be verified. Enable "Ignore SSL Issues (Insecure)" in the credential if the instance uses a self-signed certificate.';
		}
		return `The base URL could not be reached from n8n. Check that ${context.url} resolves from inside the n8n container.`;
	}
	if (isHtmlBody(context.body)) {
		return 'The server replied with an HTML page instead of JSON. The base URL probably points at the web UI or at a proxy error page rather than at the API.';
	}
	switch (kind) {
		case 'unauthorized':
			return 'Paperless-ngx expects the header "Authorization: Token <token>", not "Bearer". Re-copy the token from My Profile → API Token.';
		case 'forbidden':
			return 'The token is valid but lacks permission for this object. This is an object-level permission in Paperless-ngx, not a bad credential.';
		case 'notFound':
			return 'The object does not exist, or the base URL already carries an /api suffix — it must be the instance root, for example https://paperless.example.com.';
		case 'payloadTooLarge':
			return 'The upload exceeded the reverse proxy body limit (nginx client_max_body_size), which is not a Paperless-ngx setting.';
		case 'rateLimited':
			return context.retryAfter
				? `Rate limited; the server asks to retry after ${context.retryAfter} seconds.`
				: 'Rate limited by the server or by a proxy in front of it.';
		default:
			// 400 needs none: DRF's field errors are already the best message available.
			return undefined;
	}
}

function buildMessage(
	kind: PaperlessErrorKind,
	context: PaperlessErrorContext,
	fieldErrors?: Record<string, string[]>,
): string {
	const detail =
		context.detail ??
		extractDetail(context.body) ??
		(fieldErrors && formatFieldErrors(fieldErrors)) ??
		causeMessage(context.cause) ??
		KIND_SUMMARY[kind];
	const status = context.status > 0 ? ` (HTTP ${context.status})` : '';
	return `${context.method} ${context.url}${status}: ${detail}`;
}

export class PaperlessError extends Error {
	readonly kind: PaperlessErrorKind;
	readonly status: number;
	readonly method: string;
	readonly url: string;
	readonly body: unknown;
	readonly fieldErrors?: Record<string, string[]>;
	readonly hint?: string;
	readonly requestedApiVersion?: ApiVersion;
	readonly serverApiVersion?: number;
	readonly serverRelease?: string;

	constructor(context: PaperlessErrorContext) {
		const kind = classify(context.status, context.body);
		const fieldErrors = kind === 'validation' ? extractFieldErrors(context.body) : undefined;
		super(buildMessage(kind, context, fieldErrors));

		this.name = 'PaperlessError';
		this.kind = kind;
		this.status = context.status;
		this.method = context.method;
		this.url = context.url;
		this.body = context.body;
		this.fieldErrors = fieldErrors;
		this.hint = hintFor(kind, context);
		this.requestedApiVersion = context.requestedApiVersion;
		this.serverApiVersion = context.serverApiVersion;
		this.serverRelease = context.serverRelease;

		// The originating error is kept for debugging but hidden from enumeration:
		// n8n's transport errors carry the full request options, Authorization
		// header included, and this object gets serialized into workflow output.
		Object.defineProperty(this, 'cause', {
			value: context.cause,
			enumerable: false,
			writable: false,
			configurable: true,
		});
	}

	/** The allowlist that keeps credentials out of serialized workflow output. */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			kind: this.kind,
			status: this.status,
			method: this.method,
			url: this.url,
			message: this.message,
			fieldErrors: this.fieldErrors,
			hint: this.hint,
			requestedApiVersion: this.requestedApiVersion,
			serverApiVersion: this.serverApiVersion,
			serverRelease: this.serverRelease,
		};
	}
}
