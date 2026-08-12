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

`createClient` takes any of `IExecuteFunctions`, `ILoadOptionsFunctions`, `IHookFunctions` and
`IWebhookFunctions` — execute, the dropdown pickers, and the trigger node's activation hooks and
incoming webhook. The union is exactly the contexts a Paperless call is made from, and all four
expose the two members the client uses: `getCredentials` and
`helpers.httpRequestWithAuthentication`.

## API versions

Paperless serves API v9 and v10. The version is selected per request with
`Accept: application/json; version=N`; an unsupported value returns `406`.

**Never omit the header.** Paperless falls back to a *server-configured* default that moves between
releases. Omitting it means our response parsing changes silently when a user upgrades.

**`Auto` is optimistic, not exploratory.** It assumes v10 and sends it. There is no probe request —
a discovery round trip would buy a fact the first real request gives us for free.

**A DRF 406 is the negotiation signal, and retrying that one is safe.** DRF resolves version
negotiation in `initial()`, before the view body runs, so a 406 from Paperless guarantees no side
effect occurred. That is why we retry a `POST` after one, which would otherwise look like an
at-least-once bug.

**But not every 406 comes from DRF.** A reverse proxy answers 406 with its own HTML page for
reasons that have nothing to do with `Accept`, and that response carries no such guarantee —
replaying it sends an upload twice. A 406 with an HTML body is therefore classified as a `server`
failure and never retried. `classify()` and `hintFor()` both consult the body before the status for
exactly this reason.

**A 406 carries no version headers at all.** `ApiVersionMiddleware` sets `X-Api-Version` and
`X-Version` only when `request.user.is_authenticated`, and DRF's `initial()` calls
`determine_version()` before `perform_authentication()`. A hint that names "the server version" on a
406 would render "unknown" every single time; it names the rejected version and the fix instead.

**`X-Api-Version` is not the negotiated version either.** The middleware sets it to
`ALLOWED_VERSIONS[-1]`, the server *maximum*. It is diagnostic data on the error and nothing more —
never an input to negotiation or to the cache.

**A pinned version is never silently downgraded.** If the credential says 9, a 406 surfaces as an
error. Overriding an explicit user choice is worse than failing.

**The cache is module-scoped and keyed by base URL.** Supported versions are a property of the
server, not the token. n8n builds a fresh node instance per execution, so instance state would be
discarded before reuse — which is also the reason the client is a closure over `ctx`, not a class.

It is written only from a **2xx** response, and only under `auto`. A 401 or a 500 says nothing about
which versions the server serves, and a pinned version is a user preference, not a server
capability — caching either one lets one credential mislead every other credential on the same host,
with no 406 ever arriving to heal it. What is cached is the version *we used successfully*.

**The base URL is normalized to the instance root**, with a trailing `/api` stripped: every path in
the client already starts with `/api`, and `https://host/api/api/documents/` is the failure users
create most often. The 404 hint still mentions the suffix, because it costs nothing.

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

`paginate()` is bounded, not open-ended. `hasMore` is a server claim, and a proxy replaying a cached
page or a filter DRF re-evaluates per request keeps it true forever; the walk therefore also stops
at the reported `count` and, failing that, at a hard cap of 1000 requests. An unbounded generator
behind an n8n loop is an infinite workflow, not a slow one.

## Errors

Paperless returns six distinct failure shapes: `{"detail": …}`, DRF field errors
`{"field": ["…"]}`, top-level `non_field_errors`, an HTML proxy error page, an empty body, and
transport failures with no response at all. All collapse into one `PaperlessError` carrying `kind`,
`status`, `fieldErrors` and an optional `hint`.

A hint is written only where the raw message misleads:

| Status | Why it needs one |
|---|---|
| 406 | Names the rejected version and the fix — the response cannot reveal the server's own |
| 401 | Paperless says only "Invalid token"; the scheme is `Token`, not `Bearer` — the most common first-run failure |
| 403 | Object-level permission, not a bad token, so the user stops rotating credentials |
| 404 | Base URL probably carries an `/api` suffix |
| 413 | nginx `client_max_body_size`, not a Paperless setting — undiscoverable without the hint |
| 429 | Surface `Retry-After` |
| HTML body | Base URL points at the web UI or a proxy error page |
| self-signed cert | Point at the credential's SSL toggle; the raw OpenSSL error is unreadable |

No hint for 400 — DRF's field errors are already the best available message. Field errors are read
only from keys that are actually fields: DRF's envelope keys (`detail`, `code`, `messages`) travel
in the same object and would otherwise surface as a form field the request never had.

The originating error is kept on `cause` for debugging but is non-enumerable, kept out of `toJSON()`
— the allowlist n8n copies into workflow output — and replaced by that same allowlist in
`[util.inspect.custom]`. The last one is not belt and braces: Node's Error inspector special-cases
`cause` and prints it *even when non-enumerable*, so any logger running at raised depth would print
the axios request config, `Authorization` header included.

## Permissions

**An omitted arm means "leave unchanged", never "revoke from everyone".** `validate_set_permissions`
does `del permissions_dict[action]` for an action the payload leaves out, and
`set_permissions_for_object` iterates only the arms and sub-keys it was actually given. An earlier
draft of this document claimed Paperless replaces the whole block and had `toSetPermissions()` fill
every arm with an empty set — under the default `merge=False` that turned "grant view to user 5"
into "revoke change from every existing editor". The same applies one level down: sending only
`change.groups` must not touch `change.users`.

So the payload carries exactly what the caller supplied and nothing else, and the arrays are copied
so a later mutation of the patch cannot reach a request already built.

## Binary, without a `form-data` dependency

`IHttpRequestOptions.body` accepts a `FormData` instance directly, and Node 18+ provides `FormData`,
`Blob` and `File` as globals. The boundary comes from **axios**, not from n8n: n8n's
`isFormDataInstance()` matches only the `form-data` *package*, so a native `FormData` falls straight
through to axios's spec-compliant multipart path, which sets `Content-Type` and the boundary. Right
outcome, but not for the reason it looks like.

Two rules that look arbitrary until they bite: never set `Content-Type` yourself when passing
`FormData` (it overwrites the generated boundary and the server sees a malformed body), and never
set `json: true` alongside it (the body gets JSON-serialized).

Downloads take their file name from `Content-Disposition`. RFC 5987 `filename*` wins when it
decodes, but only then: Paperless sends `filename*=ISO-8859-1''…` for umlauts on some proxies, and a
lossy transliterated `filename` in the same header beats no name at all. The result is passed
through n8n's `sanitizeFilename` — the header is remote input and the name reaches the workflow's
binary data, so `filename*=UTF-8''..%2F..%2Fetc%2Fpasswd` must not come back out as a path.

Uploads return a task UUID, not a document. Polling `/api/tasks/` belongs to the task context — task
shapes are version-divergent, and the kernel stays ignorant of them.

## Packaging

**`n8n-workflow` is a peer dependency, and it is marked optional.** Both halves are load-bearing and
they come from opposite directions, so neither survives on its own.

n8n resolves `n8n-workflow` for community nodes itself, by injecting its own module paths into
`NODE_PATH` and calling `Module._initPaths()` (`packages/cli/src/load-nodes-and-credentials.ts`),
backed by `ENV NODE_PATH=/usr/local/lib/node_modules` in the Docker image. That is the designed
contract, and it is the only way our `NodeApiError` can be the same class n8n core checks with
`instanceof`. A second copy under `~/.n8n/nodes/node_modules` would win — Node's `node_modules`
walk-up beats `NODE_PATH` — and every `instanceof` in n8n core would then quietly say no.

A bare `"peerDependencies": { "n8n-workflow": "*" }` invites exactly that copy, and it breaks only
one of the two self-hosted install paths, which is why it survives unnoticed:

- **Settings → Community Nodes is unaffected.** n8n's installer strips dev, optional and peer
  dependencies out of the package's `package.json` before it runs npm
  (`packages/cli/src/modules/community-packages/community-packages.service.ts`).
- **`cd ~/.n8n/nodes && npm i @iamfj/n8n-nodes-paperless-ngx` is plain npm**, and npm ≥ 7
  auto-installs peers. `"*"` resolves to whatever is newest on the registry and plants a full
  `n8n-workflow` tree — `isolated-vm` included, the same native build CI needs `--ignore-scripts`
  for — right where it shadows n8n's own, at a version unpinned relative to the running n8n.

The obvious fix, deleting the block, is not available: `@n8n/community-nodes/valid-peer-dependencies`
*requires* `"n8n-workflow": "*"` and rejects any other range, and `eslint.config.mjs` is byte-frozen
against a template so the rule cannot be turned off. n8n's position is that the peer dependency is
declarative — it records what the package expects to run against, and n8n's own installer never acts
on it.

`peerDependenciesMeta: { "n8n-workflow": { optional: true } }` satisfies both. npm skips optional
peers when it auto-installs, so the manual path stops planting the shadowing copy; the lint rule only
inspects `peerDependencies` and never looks at the meta block. `n8n-workflow` is *also* a
devDependency at a pinned version, so the repo builds and tests reproducibly against a known copy
rather than whatever the tree happens to hoist.

`scripts/verify-package.mjs` asserts all of it — the peer range, the optional flag, the empty
`dependencies`, and the presence of the entry points, codex file and both icons in the tarball. It
runs in CI after the build, again in `release.yml` before the publish, and once more from
`prepublishOnly` — that last one on the pack npm is about to perform, so what it asserts is the
tarball that ships. The optional flag is the part with no other guard: nothing in lint or in the
type system notices its removal, and the symptom appears only on a stranger's manual install.

`publishConfig.access` is not optional either: `release.yml` runs a bare `npm publish` with no
`--access` flag, and a scoped package defaults to `restricted` — the first publish would fail with a
402. `provenance: true` sits in the same block and is what makes the published version carry an
attestation, which is the first thing `@n8n/scan-community-package` asserts.

## Deliberately excluded

Repository interfaces and ports (one implementation, forever). Retry/backoff (self-hosted, not rate
limited; n8n already retries at workflow level). Response caching (invalidation costs more than it
saves). Zod (a runtime dependency, which verification forbids). `Result<T, E>` (`throw` is idiomatic
and interoperates with n8n's error handling). Barrel files (they defeat the cross-context import
lint). Basic auth (token auth is strictly better; one auth path is one fewer failure mode). A
resource factory (`define-resource`) until three contexts prove its real shape.

## Testing

No msw. The client calls `ctx.helpers.httpRequestWithAuthentication`, never `fetch`, so msw would
intercept nothing — making it work would mean hand-writing a model of n8n's HTTP layer and testing
against that instead of against n8n.

Instead, inject a fake `IExecuteFunctions` whose helper is a `vi.fn()` returning canned
`{ statusCode, headers, body }` responses, and assert on the options object the client passed. That
is exactly our contract with n8n and the whole of what we own. Multipart is asserted directly
against the `FormData` instance — proving we built the body correctly needs no HTTP round trip.
Query-string serialization is n8n's job, not ours, and is not tested here.
