<div align="center">

<!-- Absolute on purpose: only dist/ is published, so a repo-relative path renders
     as a broken image on npmjs.com, which is the page reviewers open first. -->
<img src="https://raw.githubusercontent.com/iamfj/n8n-nodes-paperless-ngx/main/nodes/PaperlessNgx/paperless.svg" width="72" alt="">

# n8n-nodes-paperless-ngx

**Automate your [Paperless-ngx](https://docs.paperless-ngx.com) archive from [n8n](https://n8n.io) — and let AI agents search it.**

[![npm](https://img.shields.io/npm/v/@iamfj/n8n-nodes-paperless-ngx?color=17541f)](https://www.npmjs.com/package/@iamfj/n8n-nodes-paperless-ngx)
[![CI](https://github.com/iamfj/n8n-nodes-paperless-ngx/actions/workflows/ci.yml/badge.svg)](https://github.com/iamfj/n8n-nodes-paperless-ngx/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

- **Zero runtime dependencies**, published with npm provenance from CI.
- **Works on API v9 and v10.** The version is negotiated per request and falls back automatically,
  so the node doesn't break when you upgrade Paperless — or when you don't.
- **Uploads that actually finish.** Paperless returns a task ID, not a document. This node waits for
  Consumption to complete and hands you the real document.
- **AI-agent ready.** Every operation is exposed as a tool, so an agent can answer questions against
  your archive.

## Operations

| Resource | Operations |
|---|---|
| **Document** | Get, Get Many (search, tag/Correspondent/date filters), Download (archived, original or thumbnail), Upload (waits for Consumption), Update, Delete |
| **Document Note** | Get Many, Create, Delete |
| **Correspondent** | Create, Get, Get Many, Update, Delete |
| **Tag** | Create, Get, Get Many, Update, Delete |
| **Document Type** | Create, Get, Get Many, Update, Delete |
| **Storage Path** | Create, Get, Get Many, Update, Delete |

Correspondent, Document Type, Storage Path and Tag fields are dropdowns loaded from your instance;
each also accepts an ID from an expression.

## Installation

### Self-hosted, through the UI

**Settings → Community Nodes → Install**, then enter:

```
@iamfj/n8n-nodes-paperless-ngx
```

Two environment variables matter here:

- `N8N_COMMUNITY_PACKAGES_ENABLED` must be `true`. It is the default, so this only bites on
  instances that turned it off deliberately.
- `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` is **required to use this node as an AI-agent
  tool**. Without it the node installs and works in ordinary workflows but never appears in an AI
  Agent's tool list — which looks like a broken node rather than a missing setting.

### Self-hosted, manually

```sh
docker exec -it n8n sh        # if you run n8n in Docker
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes
npm i @iamfj/n8n-nodes-paperless-ngx
```

Then restart n8n. If `~/.n8n` is a volume but its `node_modules` is not — which is the usual result
of a `docker compose` file that mounts only the data directory — set
`N8N_REINSTALL_MISSING_PACKAGES=true` so the package is reinstalled when the container is recreated.

### n8n Cloud

Search for `Paperless-ngx` in the nodes panel and install it.

## Self-hosted gotchas

These account for most of the "it doesn't work" reports:

- **`http://localhost:8000` does not resolve from inside the n8n container.** `localhost` is the n8n
  container itself, not your Paperless one. Use the Docker Compose service name
  (`http://paperless-webserver:8000`), a LAN address, or your public hostname.
- **The Base URL is the instance root, with no `/api` suffix.** `https://paperless.example.com`, not
  `https://paperless.example.com/api` — the node appends `/api` itself.
- **Self-signed certificates need the credential's *Ignore SSL Issues (Insecure)* toggle.** The raw
  Node.js error otherwise reads as a connection failure rather than a certificate one.
- **The token scheme is `Token`, not `Bearer`.** The node sends the right one; this matters if you
  are comparing against a `curl` command that works.

## Troubleshooting

The node's error messages carry these hints already; the table is here so the two agree.

| Symptom | Cause | Fix |
|---|---|---|
| 401, "Invalid token" | Token copied from the wrong place, or an OAuth-style `Bearer` scheme expected | Re-copy from **My Profile → API Token** in Paperless-ngx |
| 403 on one object, 200 on others | Object-level permission in Paperless-ngx | Grant the token's user access to that object — the credential is fine |
| 404 on every request | Base URL points somewhere other than the instance root — a trailing `/api` is the one suffix the node drops for you, a subpath is not | Use the instance root |
| 406 | The pinned API version is not served by this instance | Set **API Version** to `Auto` in the credential |
| 413 on upload | The reverse proxy body limit, not a Paperless setting | Raise nginx `client_max_body_size` |
| "replied with an HTML page instead of JSON" | Base URL points at the web UI or at a proxy error page | Check the URL and the proxy in front of it |
| Node missing from an AI Agent's tool list | `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE` is unset | Set it to `true` and restart n8n |
| Upload times out | OCR on a long scan genuinely takes minutes | Raise **Timeout (Seconds)** on the Upload operation |

## Credentials

1. In Paperless-ngx, open **My Profile** and copy your **API Token**.
2. In n8n, create a **Paperless-Ngx API** credential:

| Field | Value |
|---|---|
| Base URL | `https://paperless.example.com` — no `/api` suffix |
| API Token | the token from step 1 |
| API Version | `Auto` unless you depend on a specific response shape |
| Ignore SSL Issues | only for self-signed certificates |

Hit **Test** — it confirms the URL and the token against `/api/profile/`.

## Usage

### File every email attachment into Paperless-ngx

Copy this into an n8n canvas (**Ctrl/Cmd+V** pastes workflow JSON directly). It watches a mailbox,
sends each attachment to Consumption, and — because *Wait for Consumption* is on — returns the
finished document rather than a task ID, so the next node can act on the real document.

```json
{
  "name": "Email attachments → Paperless-ngx",
  "nodes": [
    {
      "parameters": {
        "format": "resolved",
        "options": {}
      },
      "type": "n8n-nodes-base.emailReadImap",
      "typeVersion": 2,
      "position": [0, 0],
      "id": "8f7a1c2e-0000-4000-8000-000000000001",
      "name": "Email Trigger (IMAP)"
    },
    {
      "parameters": {
        "resource": "document",
        "operation": "upload",
        "binaryPropertyName": "attachment_0",
        "waitForConsumption": true,
        "timeout": 300,
        "additionalFields": {
          "title": "={{ $json.subject }}"
        }
      },
      "type": "@iamfj/n8n-nodes-paperless-ngx.paperlessNgx",
      "typeVersion": 1,
      "position": [220, 0],
      "id": "8f7a1c2e-0000-4000-8000-000000000002",
      "name": "Paperless-ngx"
    }
  ],
  "connections": {
    "Email Trigger (IMAP)": {
      "main": [[{ "node": "Paperless-ngx", "type": "main", "index": 0 }]]
    }
  }
}
```

`attachment_0` is the first attachment; the IMAP node numbers them from zero. Raise **Timeout
(Seconds)** if OCR on your scans takes longer than five minutes.

### Let an AI agent search the archive

Connect a **Paperless-ngx** node to an AI Agent's *Tool* input and set it to **Document → Get Many**
with the *Filters → Text* filter driven by the model. The agent then answers questions like "what did the
electrician invoice in March?" by searching your archive instead of guessing.

Self-hosted instances need `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` for the node to appear in
the tool list at all — see [Installation](#self-hosted-through-the-ui).

## Compatibility

Paperless-ngx serving API v9 or v10, and Node.js 20 or 22. Both API versions are exercised by the
test suite; the node negotiates between them per request.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Paperless-ngx REST API documentation](https://docs.paperless-ngx.com/api/)
- [CHANGELOG.md](CHANGELOG.md)

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the
house style, and [docs/architecture/shared-kernel.md](docs/architecture/shared-kernel.md) for why
the code is shaped the way it is.

## License

[MIT](LICENSE) © Fabian Jocks

This project is not affiliated with or endorsed by the Paperless-ngx project or n8n GmbH.
