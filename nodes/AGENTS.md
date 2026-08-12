# Nodes

This node is **programmatic**, not declarative. Declarative routing cannot express binary
upload/download, return-all pagination loops, or the upload → Consumption-task-poll flow. That
decision is settled; don't revisit it per-operation.

Keep node files thin. A `.node.ts` file routes: read resource + operation, delegate to the owning
context, map errors. Business logic and HTTP belong in `contexts/` and `shared/`.

## Property conventions

These are n8n's, not ours, and they outrank instinct:

- **Resource first, then Operation.** A `Resource` options property, and one `Operation` property
  per resource, shown via `displayOptions: { show: { resource: ['document'] } }`.
- **Every "Get Many" over a paginated endpoint gets `Return All` and `Limit`.** `Limit` shows only
  when `Return All` is false. A few Paperless actions are unpaginated and answer with the whole
  array — Document Notes is one — and there the pair has no page to cap.
- **Return the items, not the envelope.** Paperless is Django REST Framework, so a list endpoint
  answers `{ results: [...], count: n }`. Return the contents of `results`.
- camelCase property names. `required: true` on anything required.
- Collection entries go in alphabetical order by `displayName`. Where the list is assembled from a
  descriptor rather than written out, sort it.
- **Every single-value reference in the action node is a `type: 'resourceLocator'`**, built by
  `resourceLocator()` in `shared/presentation/`. Its `list` mode names a `methods.listSearch` entry,
  which fetches one page and returns a `paginationToken` — so the search runs on the server and
  nothing is capped. Its `id` mode is where an expression or an AI agent puts a bare ID.
- `type: 'multiOptions'` with `typeOptions.loadOptionsMethod` survives for **Tags**: n8n has
  no multi-value resourceLocator, and `loadOptions` gets no search term to pass on. That picker
  keeps the 500-entry cap and the `TRUNCATED_OPTION_VALUE` notice that makes the cap visible.
- The trigger's Correspondent and Document Type filters are still single-value `options` pickers on
  the same `loadOptions` methods, so they carry that cap too. Converting them is open work, not a
  deliberate exception — a new reference field does not copy them.
- Read a locator with `locatorId()`, or `requiredLocatorId()` where an empty one must not reach the
  URL. `getNodeParameter`'s `extractValue` does not help: every locator inside a collection arrives
  as part of one object.

Full reference: [node properties](https://docs.n8n.io/integrations/creating-nodes/build/reference/)
and [UX guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/).

## Lint rules that will bite

All from `@n8n/eslint-plugin-community-nodes`:

- Icons need **both** light and dark variants (`{ light, dark }`).
- Boolean property descriptions must start with "Whether".
- `displayName` must be title case — including the credential's, which is why it reads
  `Paperless-Ngx API` rather than the project's own lowercase `ngx`.
- Anything that *looks* like a credential field name triggers the secrets heuristic, tests included.

Every operation gets `usableAsTool` with a description written for an AI agent, not for a
developer — the agent only sees that string when deciding whether to call it. The **trigger** node
must not set it at all: `node-usable-as-tool` in `@n8n/eslint-plugin-community-nodes` 0.29.0 turned
that from required into an error, because a trigger has no `execute` for an agent to call.

That rule ships with `@n8n/node-cli`, so a local `n8n-node lint` only proves the package passes the
plugin version this repo happens to have installed — keeping the CLI current is what keeps that
proof worth anything. `@n8n/scan-community-package`, the vetting gate n8n runs on submission, is a
separate check that cannot run against a working tree at all; see `docs/code-quality.md`.

Staying current on the CLI is manual past a patch: `.github/renovate.json5` disables `major` and
`minor` updates for `@n8n/node-cli`, because both carry node-API breaks while it is still 0.x. The
bot proposes patches only; anything beyond that is a deliberate bump plus the caret in
`package.json`.
