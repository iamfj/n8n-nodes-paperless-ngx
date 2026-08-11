<div align="center">

<img src="nodes/PaperlessNgx/paperless.svg" width="72" alt="">

# n8n-nodes-paperless-ngx

**Automate your [Paperless-ngx](https://docs.paperless-ngx.com) archive from [n8n](https://n8n.io) — and let AI agents search it.**

[![npm](https://img.shields.io/npm/v/@iamfj/n8n-nodes-paperless-ngx?color=17541f)](https://www.npmjs.com/package/@iamfj/n8n-nodes-paperless-ngx)
[![CI](https://github.com/iamfj/n8n-nodes-paperless-ngx/actions/workflows/ci.yml/badge.svg)](https://github.com/iamfj/n8n-nodes-paperless-ngx/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

> [!WARNING]
> **Early development.** The kernel and tooling are in place; resources are landing context by
> context. The published API will change until `1.0.0`. Watch the repo for the first stable release.

## Why this node

- **Complete, not partial.** Every Paperless resource that has an automation story — documents,
  versions, notes, taxonomy, bulk operations, sharing, workflows, tasks, trash. Not just a document
  list.
- **Built for verification.** Zero runtime dependencies, published with npm provenance from CI.
  Every existing Paperless node on npm fails that bar today.
- **Works on API v9 and v10.** The version is negotiated per request and falls back automatically,
  so the node doesn't break when you upgrade Paperless — or when you don't.
- **Uploads that actually finish.** Paperless returns a task ID, not a document. This node can wait
  for consumption to complete and hand you the real document.
- **AI-agent ready.** Every operation is exposed as a tool, so an agent can answer questions
  against your archive.

## Installation

**n8n Cloud / verified nodes** — search for `Paperless-ngx` in the nodes panel and install it.

**Self-hosted** — Settings → Community Nodes → Install, then enter:

```
@iamfj/n8n-nodes-paperless-ngx
```

**Manual** — `npm install @iamfj/n8n-nodes-paperless-ngx` in your n8n custom nodes directory.

## Credentials

1. In Paperless-ngx, open **My Profile** and copy your **API Token**.
2. In n8n, create a **Paperless-Ngx API** credential:

| Field | Value |
|---|---|
| Base URL | `https://paperless.example.com` — no `/api` suffix |
| API Token | the token from step 1 |
| API Version | `Auto` unless you depend on a specific response shape |
| Ignore SSL Issues | only for self-signed certificates |

Hit **Test** — it confirms the token, the URL, and which API version your server speaks.

## Compatibility

| | Minimum | Tested against |
|---|---|---|
| n8n | 1.0.0 | latest |
| Paperless-ngx | 2.0 | 2.x, API v9 and v10 |
| Node.js | 20 | 20, 22 |

## Operations

<details>
<summary><b>Coverage table</b> — click to expand</summary>

Landing context by context. This table is generated from the resource specs, so it cannot drift
from the code.

_Populated as contexts ship._

</details>

## Deliberately not covered

These endpoints exist in the API but have no automation story, so they are excluded on purpose
rather than by omission:

| Endpoint | Why |
|---|---|
| `/api/ui_settings/` | Web-UI state, meaningless outside the browser |
| `/api/logs/`, `/api/config/` | Server administration, not document workflow |
| `/api/profile/*`, `/api/oauth/*`, TOTP | Account and auth management |
| `/api/documents/chat/` | Server-sent events; doesn't map to a node output |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the
house style, and [docs/architecture/shared-kernel.md](docs/architecture/shared-kernel.md) for why
the code is shaped the way it is.

## License

[MIT](LICENSE) © Fabian Jocks

This project is not affiliated with or endorsed by the Paperless-ngx project or n8n GmbH.
