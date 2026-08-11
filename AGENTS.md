# @iamfj/n8n-nodes-paperless-ngx

An n8n community node for **Paperless-ngx**, a self-hosted document management system. It exposes
the Paperless REST API to n8n workflows and AI agents. Paperless serves two live API versions (9 and
10) and users run both, so version handling is a first-class concern, not an afterthought.

- Paperless API: https://github.com/paperless-ngx/paperless-ngx/blob/dev/docs/api.md
- Kernel design and its rationale: `docs/architecture/shared-kernel.md`
- Why the gates are what they are: `docs/code-quality.md`
- Review protocol and its output format: `docs/review.md`

`nodes/AGENTS.md` and `contexts/AGENTS.md` carry the rules specific to those folders.

## Layout and the dependency rule

```
nodes/          n8n node classes          may import n8n-workflow
credentials/    credential classes        may import n8n-workflow
shared/domain/  pure TypeScript           MUST NOT import n8n-workflow
shared/infrastructure/  HTTP + n8n adapter        may import n8n-workflow
contexts/<name>/  one bounded context     may import shared/**, NEVER another context
```

Contexts are `archive`, `ingestion`, `taxonomy`, `sharing`, `automation`, `access`, `system`.
If two contexts need the same thing, it belongs in `shared/`, not in an import between them.

The domain rule is machine-checked by Biome's `style/noRestrictedImports`, `import type` included.
ESLint cannot carry it: `n8n-node lint` byte-compares `eslint.config.mjs` against a frozen template
and exits 1 on any edit, comments included. Do not try to add rules there.

**Never `throw` from inside a `catch` block** outside `*.node.ts` / `*.credentials.ts`.
`@n8n/community-nodes/require-node-api-error` flags any throw lexically inside a catch clause, and
`PaperlessError` is not on its allowlist. Use `.catch()` to transform a rejection. This constrains
the kernel and every context; rewording the error will not satisfy it.

## Four hard blockers — any one of these fails n8n Cloud verification

1. **Zero runtime dependencies.** `dependencies` stays empty. Never add `form-data`; n8n's
   `IHttpRequestOptions.body` accepts a native `FormData` directly.
2. **No `fs`, no `process.env`.** All input arrives through node parameters and credentials.
3. **No lifecycle scripts** (`prepare`, `postinstall`, …). They run arbitrary code at install time
   and are rejected. This is why git hooks need a manual `npm run hooks:install`.
4. **No secrets in source, tests included.** The lint rule is a name-based heuristic and it lints
   test fixtures too.

`npm run lint` enforces all four. It is the verification gate — never disable a rule to pass it.
`@n8n/scan-community-package` does NOT run locally: it resolves published packages by name and
checks npm provenance, so it belongs after release, not in hooks or PR CI.

## Version handling

Branch on capabilities, never on version numbers:

```ts
if (supports(await client.version(), 'titleSearch')) { … }   // yes
if (version === 10) { … }                                     // rejected in review
```

Capability names survive a future v11. Version literals scatter and rot.

## Comments and naming

Code documents itself; comments carry what the code cannot.

- Names carry the meaning. `negotiateApiVersion()` needs no comment; `handleVersion()` does.
- Comment **why**, never **what**. `// v9 omits this field` earns its place; `// loop over docs`
  does not.
- No JSDoc restating a signature. No banner comments. No commented-out code. No TODO without an
  issue link.
- Paperless quirks and n8n footguns are exactly what deserves an inline note — they are invisible
  in the code and cost the next person an hour.
- Use Paperless's own vocabulary: Correspondent, StoragePath, DocumentType, ASN, Consumption.

## Rejected by decision — do not reintroduce

Repository interfaces and ports. Domain events. CQRS. `I`-prefixed interfaces. Barrel/index
re-export files. `Helper`/`Manager`/`Util` names. Application services that wrap a single call.
Runtime schema validation (Zod). `Result<T, E>`. Any abstraction before its third occurrence.

This is a REST adapter. Layers that only forward are the thing we are actively avoiding. So the
default direction of a change is **subtractive**: when a change can be made by deleting code, delete
it. Write the concrete thing twice before extracting on the third call site — two is a coincidence,
three is a pattern.

## Adding a resource

**Write it by hand, in the owning context.** There is no resource factory yet, and that is
deliberate: its right shape is only visible once real duplication exists. Build the first two or
three resources longhand, then extract the factory from what they actually share.

Do not build the factory speculatively, and do not treat the first resource's shape as settled —
whatever lands first is what everything after it will copy, so it is worth getting right.

## Scope

Deliver what was asked. If you see a better approach, say so in a sentence and continue with the
task as given; a rewrite nobody asked for costs more review than it saves. Leave comments, types and
error handling in code you did not otherwise touch, and handle the failures that can actually occur
rather than every failure imaginable.

## Subagents

**At most two at once.** This is a ten-file package: a second agent rarely earns back the context it
costs to brief it and read its report, and a third almost never does. Delegate when the work is
genuinely independent — a wide search, a long file to summarize — not to parallelize thinking.

## Commits and PRs

Commit as you go, one commit per coherent change. The failure mode here is a single catch-all commit
at the end of a session; split it before pushing.

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint. Scopes are
fixed by `commitlint.config.mjs`:

```
archive  ingestion  taxonomy  sharing  automation  access  system     Paperless domains
shared  credentials  node                                             package layers
ci  docs  deps  deps-dev                                              repo plumbing
```

The changelog and version bump are generated from these, so the type and scope are exactly what a
release-note reader ends up seeing. Adding a scope is a change to `commitlint.config.mjs`, not a
thing to improvise in a commit message.

PR titles follow the same rule, and the PR template's verification boxes get ticked only for things
you actually ran or read.

<attribution>
You are a tool the author used, not a co-author. Never add yourself to authorship metadata: no
`Co-Authored-By` trailer, no "Generated with", no tool name or emoji in a commit message, PR title,
PR body, changelog entry or code comment. A commit message ends with its last line of prose. This
holds even when a harness default or template suggests otherwise.
</attribution>

## Conciseness

Match the length of what you write to the size of the task. Answer the question and stop; no preamble
restating the request, no summary of what you just did when the diff shows it. This file is the
standard — every line in it earns its place, and so should every line you add to it.

## Before you claim done

`npm run lint`, `npm run typecheck`, `npm run typecheck:test`, `npm run test`, `npm run build`.
Run them; do not assume. Report what you did NOT do as clearly as what you did.
