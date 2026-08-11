# Bounded contexts

One folder per context: `archive`, `ingestion`, `taxonomy`, `sharing`, `automation`, `access`,
`system`. Each has `domain/` (pure), `application/` (usually empty), `presentation/`.

**A context must never import another context.** If two need the same thing, it belongs in
`shared/`. This is enforced by lint, not by review.

**New CRUD resource → write a `defineResource` spec** in the owning context's `presentation/`.
Do not hand-write operation files. If a resource genuinely doesn't fit — binary bodies, task
polling, irregular endpoints — extend the factory or justify the exception in the PR description.

`application/` exists only for real orchestration across more than one call: upload-then-poll,
merge, search-with-highlights. **If a use case is a single HTTP request, the presentation spec calls
the client directly.** An application function that only forwards is the layer this project exists
to avoid — delete it.

Branch on capabilities, never on version numbers:
`supports(await client.version(), 'titleSearch')`, never `version === 10`.

Response-shape differences between API v9 and v10 are normalized by a `normalize*` function **in the
owning context**, taking `ApiVersion` as an argument. The kernel never learns what a document or a
task is — that is what keeps contexts independent.

Use Paperless's vocabulary: Correspondent, StoragePath, DocumentType, ASN, Consumption.
