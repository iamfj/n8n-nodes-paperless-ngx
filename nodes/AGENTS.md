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
- **Every "Get Many" gets `Return All` and `Limit`.** `Limit` shows only when `Return All` is false.
- **Return the items, not the envelope.** Paperless is Django REST Framework, so a list endpoint
  answers `{ results: [...], count: n }`. Return the contents of `results`.
- camelCase property names. `required: true` on anything required.
- `type: 'options'` with `typeOptions.loadOptionsMethod` for a list fetched at edit time (Tags,
  Correspondents); the method lives in the node's `methods.loadOptions` and returns
  `{ name, value }[]`. Use `type: 'resourceLocator'` instead when the user may also paste an ID —
  its `list` mode takes `typeOptions.searchListMethod`, resolved from `methods.listSearch`.

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
developer — the agent only sees that string when deciding whether to call it.
