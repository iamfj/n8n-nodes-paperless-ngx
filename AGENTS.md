# n8n community node

> **This project: `@iamfj/n8n-nodes-paperless-ngx`.** Read `#project-rules` at the bottom of this
> file before writing any code. Where it conflicts with the generic guidance above it, it wins.

## Overview
This is a project containing code for an n8n community node. n8n is a workflow
automation platform where users build workflows with nodes, which are the
building block of a workflow. Nodes can perform a range of actions, such as
starting a workflow (called a "trigger node"), fetching and sending data, or
processing and manipulating it. Besides that there are credentials - entities
that store sensitive information on how to connect to external services and
APIs. A node can require some credentials to be used. Community nodes are a way
for anyone to create such nodes and add them to be used in n8n. All community
nodes are named in a format: `n8n-nodes-<n>` or `@org/n8n-nodes-<n>`.
Community nodes can also be submitted for approval to be used on n8n Cloud
version. In that case there are rules that the node needs to follow in order to
be approved

## Important notes
- Follow the **rules and guidelines in this document and the linked docs
  below** over any code examples.
- All code blocks in these docs are **illustrative and incomplete**.
  They **MUST NOT** be copied verbatim or assumed to be the final desired code.
- Replace example names like `Example`, `Wordpress`, `wordpressApi`, etc.
  with names that match the **actual service / node** you are building.
- When in doubt, **generalize from the patterns**, don't replicate the exact
  structure, fields, or values from the examples.
- Produce the **full implementation** needed for the current project
  (nodes, credentials, tests, etc.), not just fragments similar to examples.
- If an example omits parts (e.g. types, operations, properties), **infer and
  implement the missing parts** based on the real requirements / API docs.
- Never output `Wordpress`-specific code unless the project is actually about
  WordPress.

## Project structure
There are two main folders in this project:
- `nodes` contains all of the nodes in a package (there can be more than 1).
  The code for each node usually lives in its own folder
- `credentials` contains all of the credentials in a package. Usually it's just
  a single file for every credential
So it looks something like this:
.
├── nodes/
│   └── Example/
│       ├── Example.node.ts
│       └── ...
├── credentials/
│   └── Example.credentials.ts
├── package.json
└── ...
It's important to note that `package.json` has a special field `n8n` that have
information about nodes and credentials in a package:
```json
{
  "name": "n8n-nodes-example",
  "version": "1.0.0",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "strict": true,
    "credentials": [
        "dist/credentials/Example.credentials.js"
    ],
    "nodes": [
      "dist/nodes/Example/Example.node.js"
    ]
  }
}
```
`nodes` and `credentials` keys contain paths to transpiled JS files in a `dist`
folder for the nodes and credentials respectively. If you add/remove/rename
nodes and/or credentials, you need to make sure to update `n8n.nodes` and
`n8n.credentials` keys in `package.json` accordingly. Initial files in the
project _may_ contain example nodes and/or credentials that need to be
**removed or renamed** once you start making an actual node.

## Key guidelines
- Use the `n8n-node` CLI tool **whenever possible** for building, dev mode,
  linting, etc.
- **Always** address any lint/typecheck errors/warnings, unless there is a
  **very specific reason** to ignore/disable it
- Make sure to use **proper types whenever possible**
- If you are updating the npm package version, make sure to **update
  CHANGELOG.md** in the root of the repository
- Read `.agents/workflow.md` for more info

## Context-specific docs
Load these before working on the relevant area:

| Working on...                        | Read first                                                          |
|--------------------------------------|---------------------------------------------------------------------|
| Any node file in `nodes/`            | `.agents/nodes.md` and `.agents/properties.md`                      |
| A declarative-style node             | above + `.agents/nodes-declarative.md`                              |
| A programmatic-style node            | above + `.agents/nodes-programmatic.md`                             |
| Files in `credentials/`              | `.agents/credentials.md`                                            |
| Adding a new version to a node       | `.agents/versioning.md`                                             |
| Starting a new task or planning      | `.agents/workflow.md`                                               |

## Project rules
<a id="project-rules"></a>

This package integrates **Paperless-ngx**, a self-hosted document management system. It exposes the
Paperless REST API to n8n workflows and AI agents. Paperless serves two live API versions (9 and 10)
and users run both, so version handling is a first-class concern, not an afterthought.

API reference: https://github.com/paperless-ngx/paperless-ngx/blob/dev/docs/api.md
Kernel design and its rationale: `docs/architecture/shared-kernel.md`

### Layout and the dependency rule

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

### Four hard blockers — any one of these fails n8n Cloud verification

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

### Version handling

Branch on capabilities, never on version numbers:

```ts
if (supports(await client.version(), 'titleSearch')) { … }   // yes
if (version === 10) { … }                                     // rejected in review
```

Capability names survive a future v11. Version literals scatter and rot.

### Comments and naming

Code documents itself; comments carry what the code cannot.

- Names carry the meaning. `negotiateApiVersion()` needs no comment; `handleVersion()` does.
- Comment **why**, never **what**. `// v9 omits this field` earns its place; `// loop over docs`
  does not.
- No JSDoc restating a signature. No banner comments. No commented-out code. No TODO without an
  issue link.
- Paperless quirks and n8n footguns are exactly what deserves an inline note — they are invisible
  in the code and cost the next person an hour.
- Use Paperless's own vocabulary: Correspondent, StoragePath, DocumentType, ASN, Consumption.

### Rejected by decision — do not reintroduce

Repository interfaces and ports. Domain events. CQRS. `I`-prefixed interfaces. Barrel/index
re-export files. `Helper`/`Manager`/`Util` names. Application services that wrap a single call.
Runtime schema validation (Zod). `Result<T, E>`. Any abstraction before its third occurrence.

This is a REST adapter. Layers that only forward are the thing we are actively avoiding.

### Adding a resource

**Write it by hand, in the owning context.** There is no resource factory yet, and that is
deliberate: its right shape is only visible once real duplication exists. Build the first two or
three resources longhand, then extract the factory from what they actually share.

Do not build the factory speculatively, and do not treat the first resource's shape as settled —
whatever lands first is what everything after it will copy, so it is worth getting right.

### Before you claim done

`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`. Run them; do not assume.
Report what you did NOT do as clearly as what you did.

## Additional resources
If you need any extra information, here are links to n8n's official docs
regarding building community nodes:
- https://docs.n8n.io/integrations/community-nodes/build-community-nodes/
- https://docs.n8n.io/integrations/creating-nodes/overview/
- https://docs.n8n.io/integrations/creating-nodes/build/reference/
- https://docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/
