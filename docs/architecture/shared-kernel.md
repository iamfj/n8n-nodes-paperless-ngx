# Shared kernel — design

The kernel is what every bounded context imports and nothing imports back. It owns HTTP,
API-version negotiation, pagination and the error model. It deliberately knows nothing about
documents, tags or tasks.

## Layer rule

```
shared/domain/**          pure TypeScript. MUST NOT import n8n-workflow.
shared/infrastructure/**  the n8n + HTTP adapter. May import n8n-workflow.
contexts/*/               may import shared/**. MUST NOT import another context.
```

Two folders, one rule. An earlier draft split `infrastructure/` from `n8n/`, but both would have
imported `n8n-workflow`, making the distinction unenforceable and meaningless — so they are merged.
`domain` is pure and everything else is the adapter.

Enforced by `no-restricted-imports`, not by review discipline.

## API versions

Paperless serves API v9 and v10. The version is selected per request with
`Accept: application/json; version=N`; an unsupported value returns `406`.

**Never omit the header.** Paperless falls back to a *server-configured* default that moves between
releases. Omitting it means our response parsing changes silently when a user upgrades.

**`Auto` is optimistic, not exploratory.** It assumes v10 and sends it. There is no probe request —
a discovery round trip would buy a fact the first real request gives us for free.

**406 is the negotiation signal, and retrying it is safe.** DRF resolves version negotiation in
`initial()`, before the view body runs, so a 406 guarantees no side effect occurred. That is why we
retry a `POST` after one, which would otherwise look like an at-least-once bug.

**A pinned version is never silently downgraded.** If the credential says 9, a 406 surfaces as an
error. Overriding an explicit user choice is worse than failing.

**The cache is module-scoped and keyed by base URL.** Supported versions are a property of the
server, not the token. n8n builds a fresh node instance per execution, so instance state would be
discarded before reuse — which is also the reason the client is a closure over `ctx`, not a class.
A later 406 overwrites a cached value, so the cache self-heals with no TTL.

**Contexts branch on capabilities, never on version numbers.**

```ts
if (supports(await client.version(), 'titleSearch')) { ... }   // yes
if (version === 10) { ... }                                     // rejected in review
```

Capability names survive a future v11; version literals do not. Six divergences exist on day one,
so the abstraction is already past the rule-of-three.

Known divergences: individual document-edit endpoints, `title_search` vs `title_content`, bulk-edit
object filters, the redesigned task system, and saved-view display flags (v9-only).

> `created` becoming a date is a **v9** change, not v10. It is identical on both supported versions
> and is therefore not a conditional at all.

## Pagination

`Page<T>` exposes `hasMore`, not `next`. DRF builds `next` as an absolute URI from the host it
believes it has; behind a reverse proxy with a misconfigured `X-Forwarded-Host` — the norm in
self-hosted Paperless — that is `http://localhost:8000/…`, unreachable from n8n and capable of
sending an authenticated request to an unintended origin. We use `next` only as a boolean and page
by incrementing against our own normalized base URL. Making the unsafe URL unavailable beats
documenting that it is unsafe.

## Errors

Paperless returns six distinct failure shapes: `{"detail": …}`, DRF field errors
`{"field": ["…"]}`, top-level `non_field_errors`, an HTML proxy error page, an empty body, and
transport failures with no response at all. All collapse into one `PaperlessError` carrying `kind`,
`status`, `fieldErrors` and an optional `hint`.

A hint is written only where the raw message misleads:

| Status | Why it needs one |
|---|---|
| 406 | Must name both requested and server version, or the user cannot act |
| 401 | Paperless says only "Invalid token"; the scheme is `Token`, not `Bearer` — the most common first-run failure |
| 403 | Object-level permission, not a bad token, so the user stops rotating credentials |
| 404 | Base URL probably carries an `/api` suffix |
| 413 | nginx `client_max_body_size`, not a Paperless setting — undiscoverable without the hint |
| 429 | Surface `Retry-After` |
| HTML body | Base URL points at the web UI or a proxy error page |
| self-signed cert | Point at the credential's SSL toggle; the raw OpenSSL error is unreadable |

No hint for 400 — DRF's field errors are already the best available message.

## Binary, without a `form-data` dependency

`IHttpRequestOptions.body` accepts a `FormData` instance directly, and Node 18+ provides `FormData`,
`Blob` and `File` as globals. n8n sets `multipart/form-data` and the boundary itself.

Two rules that look arbitrary until they bite: never set `Content-Type` yourself when passing
`FormData` (it overwrites the generated boundary and the server sees a malformed body), and never
set `json: true` alongside it (the body gets JSON-serialized).

Uploads return a task UUID, not a document. Polling `/api/tasks/` belongs to the task context — task
shapes are version-divergent, and the kernel stays ignorant of them.

## Deliberately excluded

Repository interfaces and ports (one implementation, forever). Retry/backoff (self-hosted, not rate
limited; n8n already retries at workflow level). Response caching (invalidation costs more than it
saves). Zod (a runtime dependency, which verification forbids). `Result<T, E>` (`throw` is idiomatic
and interoperates with n8n's error handling). Barrel files (they defeat the cross-context import
lint). Basic auth (token auth is strictly better; one auth path is one fewer failure mode).
`define-resource` is a type signature only until three contexts prove its real shape.

## Testing

No msw. The client calls `ctx.helpers.httpRequestWithAuthentication`, never `fetch`, so msw would
intercept nothing — making it work would mean hand-writing a model of n8n's HTTP layer and testing
against that instead of against n8n.

Instead, inject a fake `IExecuteFunctions` whose helper is a `vi.fn()` returning canned
`{ statusCode, headers, body }` responses, and assert on the options object the client passed. That
is exactly our contract with n8n and the whole of what we own. Multipart is asserted directly
against the `FormData` instance — proving we built the body correctly needs no HTTP round trip.
Query-string serialization is n8n's job, not ours, and is not tested here.
