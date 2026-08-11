# Bounded contexts

One folder per context: `archive`, `ingestion`, `taxonomy`, `sharing`, `automation`, `access`,
`system`. Each has `domain/` (pure), `application/` (usually empty), `presentation/`.

**A context must never import another context.** If two need the same thing, it belongs in
`shared/`. This is enforced by lint, not by review.

**Write resources by hand.** There is no factory yet — see the root `AGENTS.md`. Extract one once
two or three resources exist and the duplication is real.

Add folders when you need them, not before. A context that is one file is one file.

Branch on capabilities, never on version numbers:
`supports(await client.version(), 'titleSearch')`, never `version === 10`.

Response-shape differences between API v9 and v10 are normalized by a `normalize*` function **in the
owning context**, taking `ApiVersion` as an argument. The kernel never learns what a document or a
task is — that is what keeps contexts independent.

Use Paperless's vocabulary: Correspondent, StoragePath, DocumentType, ASN, Consumption.
