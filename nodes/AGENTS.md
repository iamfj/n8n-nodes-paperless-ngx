# Nodes

Read `../.agents/nodes.md`, `../.agents/nodes-programmatic.md` and `../.agents/properties.md` first
— they are n8n's own conventions and they outrank instinct on property naming, `displayName` casing
and option ordering.

This node is **programmatic**, not declarative. Declarative routing cannot express binary
upload/download, return-all pagination loops, or the upload → Consumption-task-poll flow. That
decision is settled; don't revisit it per-operation.

Keep node files thin. A `.node.ts` file routes: read resource + operation, delegate to the owning
context, map errors. Business logic and HTTP belong in `contexts/` and `shared/`.

Lint rules that will bite, all from `@n8n/eslint-plugin-community-nodes`:

- Icons need **both** light and dark variants (`{ light, dark }`).
- Boolean property descriptions must start with "Whether".
- `displayName` must be title case — including the credential's, which is why it reads
  `Paperless-Ngx API` rather than the project's own lowercase `ngx`.
- Anything that *looks* like a credential field name triggers the secrets heuristic, tests included.

Every operation gets `usableAsTool` with a description written for an AI agent, not for a
developer — the agent only sees that string when deciding whether to call it.
