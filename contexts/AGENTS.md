# Bounded contexts

The layout, the no-cross-context-import rule and the capability rule are in the root `AGENTS.md`.
One thing lives only here:

Response-shape differences between API v9 and v10 are normalized by a `normalize*` function **in the
owning context**, taking `ApiVersion` as an argument. The kernel never learns what a document or a
task is — that is what keeps contexts independent of each other and of the version.

Each context has `domain/` (pure), `application/` (usually empty), `presentation/`. Add folders when
you need them. A context that is one file is one file.
