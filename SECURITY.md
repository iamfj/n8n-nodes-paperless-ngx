# Security Policy

## Reporting a vulnerability

Report privately through GitHub Security Advisories:
[**Report a vulnerability**](https://github.com/iamfj/n8n-nodes-paperless-ngx/security/advisories/new).

Please do not open a public issue for a security problem.

Include the node version, your Paperless-ngx version and API version (9 or 10), and
enough detail to reproduce. You will get an acknowledgement within 72 hours and an
assessment within a week. If the report is valid you will be credited in the
advisory unless you ask otherwise.

## Why credential handling gets taken seriously here

This node holds an API token for a Paperless-ngx instance. That token is a bearer
credential for someone's entire personal document archive — contracts, invoices,
medical records, tax filings. Most of these instances are self-hosted by one person
with no security team behind them.

So reports in these areas are treated as high severity, not as hardening
suggestions:

- A token leaking into logs, error messages, node output, or a thrown exception.
- A credential field missing `password: true`, or a token surviving into serialized
  workflow data.
- A request going somewhere other than the configured base URL — SSRF through a
  user-supplied path, or a redirect carrying the `Authorization` header to another
  host.
- Document content or binary data crossing between workflow items or executions.

The package ships zero runtime dependencies and does not touch the filesystem or
environment variables, which keeps the supply-chain surface small — but it does not
make the token handling above safe by itself.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅ Latest minor only |

Pre-1.0, fixes land on the newest release. There are no backports to older 0.x
minors; upgrade to pick up a fix.

Vulnerabilities in Paperless-ngx itself belong to
[paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx/security),
and vulnerabilities in n8n to [n8n-io/n8n](https://github.com/n8n-io/n8n/security).
