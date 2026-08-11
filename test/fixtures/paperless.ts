/**
 * Response fixtures captured from the Paperless-ngx REST API contract.
 *
 * Field names are taken from the upstream serializers, not invented:
 *   - documents:  src/documents/serialisers.py  → DocumentSerializer.Meta.fields
 *   - profile:    src/paperless/serialisers.py  → ProfileSerializer.Meta.fields
 *   - pagination: src/paperless/views.py        → StandardPagination
 *
 * The kernel tests feed these straight to a stubbed
 * `helpers.httpRequestWithAuthentication` as canned full responses.
 */

/**
 * `ApiVersionMiddleware` sets `X-Api-Version` and `X-Version` only when the
 * request authenticated, and the value is `ALLOWED_VERSIONS[-1]` — the server
 * maximum, not the version the request negotiated. They are diagnostic data
 * only; nothing in the client decides anything from them.
 */
export const headersV10 = {
	'content-type': 'application/json',
	'x-api-version': '10',
	'x-version': '3.0.5',
} as const;

export const headersV9 = {
	'content-type': 'application/json',
	'x-api-version': '9',
	'x-version': '3.0.5',
} as const;

const document = {
	id: 42,
	correspondent: 3,
	document_type: 1,
	storage_path: null,
	title: 'Invoice 2026-04',
	content: 'Rechnung Nr. 2026-04 ...',
	tags: [5, 8],
	created: '2026-04-01',
	created_date: '2026-04-01',
	modified: '2026-04-02T09:14:11.482Z',
	added: '2026-04-01T18:02:57.104Z',
	deleted_at: null,
	archive_serial_number: null,
	original_file_name: 'invoice-2026-04.pdf',
	archived_file_name: '2026-04-01 Invoice 2026-04.pdf',
	owner: 1,
	user_can_change: true,
	is_shared_by_requester: false,
	notes: [],
	custom_fields: [],
	page_count: 2,
	mime_type: 'application/pdf',
};

/**
 * StandardPagination drops the `all` key from API v10 onward; on v9 it carries
 * the full list of matching IDs. Both shapes exist so the negotiated version
 * can be asserted from the body as well as the header.
 */
export const documentsPageV10 = {
	count: 31,
	next: 'https://paperless.example.com/api/documents/?page=2',
	previous: null,
	results: [document],
};

export const documentsPageV9 = {
	count: 31,
	next: 'https://paperless.example.com/api/documents/?page=2',
	previous: null,
	all: [42, 43, 44],
	results: [document],
};

// Real Paperless returns the user's API token in the profile payload. Tests care
// about the field being present and passed through, never about its contents, so
// the value is a self-evident placeholder rather than a token-shaped string.
const placeholderToken = 'not-a-real-token';

/** `password` is write-only upstream and never appears in a GET response. */
export const profile = {
	email: 'fabian@example.com',
	first_name: 'Fabian',
	last_name: 'Jocks',
	auth_token: placeholderToken,
	social_accounts: [],
	has_usable_password: true,
	is_mfa_enabled: false,
};

/** DRF field-level validation failure: HTTP 400, keyed by field name. */
export const fieldValidationError = {
	title: ['This field may not be blank.'],
	correspondent: ['Invalid pk "999" - object does not exist.'],
};

/** DRF's generic error envelope: HTTP 404 here, but the shape covers 401/403 too. */
export const detailError = {
	detail: 'Not found.',
};

/**
 * HTTP 406, returned when the Accept header requests a version the server does
 * not support. The status is documented upstream; the message is DRF's default
 * for AcceptHeaderVersioning and is the part to treat as illustrative.
 */
export const versionMismatchError = {
	detail: 'Invalid version in "Accept" header.',
};

/**
 * A 406 carries no version headers: DRF's `initial()` calls
 * `determine_version()` before `perform_authentication()`, and
 * `ApiVersionMiddleware` sets the headers only for an authenticated request.
 */
export const headersNotAcceptable = { 'content-type': 'application/json' } as const;

/** What a reverse proxy answers with when it, not Paperless, refuses the request. */
export const proxyHtmlPage =
	'<!DOCTYPE html><html><head><title>406 Not Acceptable</title></head><body>nginx</body></html>';
