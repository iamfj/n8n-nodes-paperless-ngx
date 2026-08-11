# Contributing

Thanks for helping out. This node talks to self-hosted Paperless-ngx instances, so
most contributions come from people who hit a missing endpoint in their own setup.

## Setup

Node 20 or newer.

```bash
npm ci
npm run hooks:install   # once per clone — see below
npm run dev             # runs n8n with this node linked, hot-reloading on change
```

**`npm run hooks:install` is not optional and not automatic.** n8n forbids `prepare`
and other install-time lifecycle scripts in community node packages
(`@n8n/community-nodes/no-forbidden-lifecycle-scripts`, since they would run
arbitrary code on every consumer's `npm install`). The consequence is that lefthook
does not wire itself up when you clone: commit-message and pre-commit hooks silently
do not exist until you run that command once. If commitlint never seems to complain
about your commit messages, this is why.

Open the n8n instance it prints, add a Paperless-ngx credential pointing at your
own server, and drop the node into a workflow. `npm run dev` is the fastest loop —
you rarely need to build manually.

Other commands:

```bash
npm test              # vitest
npm run test:watch
npm run typecheck     # source
npm run typecheck:test # tests
npm run lint
npm run build
```

## Adding a resource or operation

Resources map to Paperless-ngx API endpoints and live under `contexts/`, grouped by
bounded context (`archive`, `taxonomy`, `ingestion`, …). Shared plumbing lives in
`shared/`.

1. Find the endpoint in the [Paperless-ngx API docs](https://docs.paperless-ngx.com/api/)
   and confirm the response shape against the upstream serializer. Do not guess
   field names — Paperless returns different shapes on API v9 and v10.
2. Add the operation in the matching context. Reuse the shared HTTP client; do not
   call `httpRequest` directly.
3. Add fixtures to `test/fixtures/paperless.ts` if the shape is new, and tests using
   the fake context from `test/fake-execute-functions.ts`.
4. If it is a new resource, wire it into the node's resource list and update the
   README.

Two rules the build enforces, and one it cannot:

- **Zero runtime dependencies.** Everything new is a devDependency.
- **No `fs`, no `process.env`.** n8n's verification scanner rejects both.
- **Layer rule:** code under `shared/domain/` must never import `n8n-workflow`.
  Domain logic stays testable without the n8n runtime. Nothing checks this
  automatically yet, so reviewers check it by hand.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint
on every commit:

```
feat(archive): add document download operation
fix(taxonomy): keep tag colours on update
docs: explain API version pinning
```

The changelog and version bump are generated from these, so the type and scope are
what a release note reader ends up seeing.

## Comments

Names carry the meaning; comments carry the reasoning.

- Comment **why**, never **what**. If a reader can see it from the code, delete it.
- No JSDoc that restates a signature. `@param id The id` is noise.
- No banner or section-divider comments.
- No `TODO` without a linked issue. `// TODO(#42): ...` or don't write it.

A comment explaining that Paperless returns `all` only below API v10 is worth its
line. A comment saying `// fetch the documents` above `fetchDocuments()` is not.
