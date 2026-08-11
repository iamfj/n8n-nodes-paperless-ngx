import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';
import {
	type ApiVersion,
	type ApiVersionSetting,
	acceptHeader,
	isSupported,
	PREFERRED_API_VERSION,
	parseApiVersionHeader,
	SUPPORTED_API_VERSIONS,
} from '../domain/api-version';
import { type DrfPage, isDrfPage, type Page, toPage } from '../domain/pagination';
import { PaperlessError } from '../domain/paperless-error';
import { fileNameFromContentDisposition, toBuffer } from './binary';

export type RequestSpec = {
	method: IHttpRequestMethods;
	path: string;
	qs?: Record<string, unknown>;
	body?: unknown;
	form?: FormData;
	binary?: boolean;
};

export type BinaryResponse = { data: Buffer; mimeType?: string; fileName?: string };

export type PaperlessClient = {
	request<T>(spec: RequestSpec): Promise<T>;
	requestPage<T>(spec: RequestSpec): Promise<Page<T>>;
	requestBinary(spec: RequestSpec): Promise<BinaryResponse>;
	version(): Promise<ApiVersion>;
};

export const CREDENTIAL_NAME = 'paperlessNgxApi';

type FullResponse = { statusCode: number; headers: Record<string, unknown>; body: unknown };

// Module scope, keyed by base URL: which versions a server speaks is a property
// of that server, not of the token or the workflow. n8n builds a fresh node
// instance per execution, so anything held on an instance would be thrown away
// before it could be reused. A later 406 overwrites the entry, so the cache
// heals itself after a server upgrade and needs no TTL.
const negotiatedVersions = new Map<string, ApiVersion>();

export function normalizeBaseUrl(raw: string): string {
	return raw.trim().replace(/\/+$/, '');
}

function readVersionSetting(raw: unknown): ApiVersionSetting {
	const parsed = parseApiVersionHeader(raw);
	return parsed !== undefined && isSupported(parsed) ? parsed : 'auto';
}

function header(headers: Record<string, unknown>, name: string): string | undefined {
	const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
	const value = Array.isArray(match?.[1]) ? match?.[1][0] : match?.[1];
	return typeof value === 'string' ? value : undefined;
}

function compact(qs: Record<string, unknown>): IDataObject {
	return Object.fromEntries(
		Object.entries(qs).filter(([, value]) => value !== undefined && value !== null),
	) as IDataObject;
}

export async function createClient(ctx: IExecuteFunctions): Promise<PaperlessClient> {
	const credentials = await ctx.getCredentials(CREDENTIAL_NAME);
	const baseUrl = normalizeBaseUrl(String(credentials.baseUrl ?? ''));
	const setting = readVersionSetting(credentials.apiVersion);
	const skipSslCertificateValidation = credentials.ignoreSslIssues === true;

	function candidates(): ApiVersion[] {
		if (setting !== 'auto') {
			return [setting];
		}
		const first = negotiatedVersions.get(baseUrl) ?? PREFERRED_API_VERSION;
		return [first, ...SUPPORTED_API_VERSIONS.filter((version) => version !== first)];
	}

	async function send(spec: RequestSpec, version: ApiVersion): Promise<FullResponse> {
		const url = `${baseUrl}${spec.path}`;
		const options: IHttpRequestOptions = {
			method: spec.method,
			url,
			headers: { Accept: acceptHeader(version) },
			// The status is read here rather than thrown by n8n: a 406 has to be
			// recoverable, and every other failure has to become a PaperlessError
			// instead of an opaque one.
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			skipSslCertificateValidation,
		};

		if (spec.qs) {
			options.qs = compact(spec.qs);
			// Paperless filters through DRF, which reads repeated keys: `tags=1&tags=2`.
			// Any other array format is accepted by the server and silently matches
			// nothing.
			options.arrayFormat = 'repeat';
		}

		if (spec.form) {
			// No Content-Type and no `json` flag alongside FormData: the first would
			// replace the generated multipart boundary, the second would serialize
			// the form to JSON.
			options.body = spec.form;
		} else if (spec.body !== undefined) {
			options.body = spec.body as IHttpRequestOptions['body'];
			options.json = true;
		} else if (!spec.binary) {
			options.json = true;
		}

		if (spec.binary) {
			options.encoding = 'arraybuffer';
		}

		return (await ctx.helpers.httpRequestWithAuthentication
			.call(ctx, CREDENTIAL_NAME, options)
			.catch((cause: unknown) => {
				// A transport failure never reached Paperless, so there is no status to
				// classify; it still leaves the kernel as a PaperlessError, which the
				// node layer turns into a NodeApiError via error-mapper.
				throw new PaperlessError({
					method: spec.method,
					url,
					status: 0,
					body: undefined,
					requestedApiVersion: version,
					cause,
				});
			})) as FullResponse;
	}

	async function execute(spec: RequestSpec): Promise<FullResponse> {
		const attempts = candidates();
		let version = attempts[0];
		let response = await send(spec, version);

		// DRF resolves version negotiation in `initial()`, before the view body runs,
		// so a 406 proves nothing happened server-side. That is what makes retrying
		// the very same request — POST included — safe rather than at-least-once.
		for (let attempt = 1; attempt < attempts.length && response.statusCode === 406; attempt++) {
			version = attempts[attempt];
			response = await send(spec, version);
		}

		const reportedVersion = parseApiVersionHeader(header(response.headers, 'x-api-version'));
		if (response.statusCode !== 406) {
			negotiatedVersions.set(
				baseUrl,
				reportedVersion !== undefined && isSupported(reportedVersion) ? reportedVersion : version,
			);
		}

		if (response.statusCode >= 400) {
			throw new PaperlessError({
				method: spec.method,
				url: `${baseUrl}${spec.path}`,
				status: response.statusCode,
				body: response.body,
				requestedApiVersion: version,
				serverApiVersion: reportedVersion,
				serverRelease: header(response.headers, 'x-version'),
				retryAfter: header(response.headers, 'retry-after'),
			});
		}
		return response;
	}

	return {
		async request<T>(spec: RequestSpec): Promise<T> {
			return (await execute(spec)).body as T;
		},

		async requestPage<T>(spec: RequestSpec): Promise<Page<T>> {
			const response = await execute(spec);
			if (!isDrfPage(response.body)) {
				throw new PaperlessError({
					method: spec.method,
					url: `${baseUrl}${spec.path}`,
					status: response.statusCode,
					body: response.body,
					detail: 'expected a paginated list response',
				});
			}
			return toPage(response.body as DrfPage<T>);
		},

		async requestBinary(spec: RequestSpec): Promise<BinaryResponse> {
			const response = await execute({ ...spec, binary: true });
			return {
				data: toBuffer(response.body),
				mimeType: header(response.headers, 'content-type'),
				fileName: fileNameFromContentDisposition(header(response.headers, 'content-disposition')),
			};
		},

		async version(): Promise<ApiVersion> {
			if (setting !== 'auto') {
				return setting;
			}
			// Optimistic, never exploratory: with nothing negotiated yet this reports
			// the preferred version instead of spending a round trip to discover what
			// the first real request tells us anyway.
			return negotiatedVersions.get(baseUrl) ?? PREFERRED_API_VERSION;
		},
	};
}
