# n8n Cloud verification readiness

What n8n asks of a community node, where each requirement is enforced here, and what is left that no
repository check can cover. The requirements are read from n8n's two published pages:

- [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)
- [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes)

## Requirement matrix

| Requirement | Enforced by | Evidence |
| --- | --- | --- |
| Zero runtime dependencies | `@n8n/community-nodes/no-runtime-dependencies` (ESLint) + `scripts/verify-package.mjs:50-53` | `package.json` has no `dependencies` key |
| No `fs`, no `process.env` | `@n8n/community-nodes/no-restricted-imports` (an allowlist that omits `fs`) and `@n8n/community-nodes/no-restricted-globals` (which lists `process`) | all input arrives via node parameters and credentials |
| No install-time lifecycle scripts | `@n8n/community-nodes/no-forbidden-lifecycle-scripts` | git hooks install through `npm run hooks:install`, never `prepare` |
| No secrets in source | `@n8n/community-nodes/no-hardcoded-secrets` | lints test fixtures too |
| `n8n` strict mode | `n8n-node lint`, which byte-compares `eslint.config.mjs` against its template | `package.json#n8n.strict` is `true`; see `docs/code-quality.md` |
| Package name matches `n8n-nodes-*` or is scoped | `@n8n/community-nodes/package-name-convention` | `@iamfj/n8n-nodes-paperless-ngx` |
| `homepage`, `author`, `version`, `files` in `package.json` | `require-homepage`, `valid-author`, `require-version`, `require-files-array` | all four present |
| `n8n-community-node-package` keyword | manual | `package.json#keywords[0]` |
| Every `.node.ts` registered in the `n8n` block | `@n8n/community-nodes/node-registration-complete` | one node, one entry |
| The `n8n` block's entry points reach the tarball | `scripts/verify-package.mjs:35-37` | asserts both paths are inside `npm pack --dry-run` |
| Codex file and icons ship | `scripts/verify-package.mjs:42-48` | `tsc` emits neither; `n8n-node build` copies them |
| Credential exposes a test request, a `documentationUrl` and password fields | `credential-test-required`, `credential-documentation-url`, `credential-password-field` | `credentials/PaperlessNgxApi.credentials.ts`, covered by `test/paperless-ngx-api-credentials.test.ts` |
| MIT licence | manual | `LICENSE`, `package.json#license` |
| Repository URL that resolves | manual, runbook step 2 | `package.json#repository` |
| Written in TypeScript | manual | no JavaScript outside `scripts/` |
| English-only UI strings | manual | node and credential display names and descriptions |
| Published from GitHub Actions with npm provenance | `.github/workflows/release.yml` | `publishConfig.provenance`, `id-token: write` |
| Provenance actually landed on the published version | `@n8n/scan-community-package` job in `release.yml` | runs post-publish; its first assertion is provenance |
| Documentation links in the codex | manual | `nodes/PaperlessNgx/PaperlessNgx.node.json#resources` |
| Example workflows in the README | manual | `README.md` → Usage |
| Does not duplicate a verified integration | manual, runbook step 6 | n8n's community-node list carries no Paperless node |
| Package exists on the npm registry | runbook step 4 | nothing is published yet |

`npm run lint` runs every ESLint rule above. `npm run verify:package` runs the pack-time checks. Both
run in CI on every pull request; `verify:package` additionally runs from `prepublishOnly`, after the
release build and before npm packs, so the tarball that is asserted is the tarball that is published.

## Runbook — the manual steps

These cannot be done from the repository.

1. Confirm the npm account owns the `@iamfj` scope and that its identity matches the GitHub
   maintainer. n8n checks that the npm publisher and the repository maintainer are the same person.
2. Confirm the GitHub repository is public and its URL matches `package.json#repository`.
3. Create an npm **Granular Access Token** on npmjs.com and add it as the `NPM_TOKEN` repository
   secret. A Trusted Publisher is configured from a package's own settings page, so it does not exist
   before the first publish — that one goes through the token. Scope it to the `@iamfj` **scope**,
   not to the package, which does not exist yet, with *Read and write*. Set **Bypass 2FA = true**: it
   defaults to false, and CI publishing then fails with `EOTP`. Its expiry is capped at 90 days,
   which is fine — step 5 deletes it.
4. Tag the release and push it: `git tag 0.1.0 && git push origin 0.1.0`. That starts `release.yml`
   on its tag path — the five gates, `verify:package`, publish with provenance, then the scan.
   Afterwards run `gh release create 0.1.0 --verify-tag --title 0.1.0 --notes-file -` with the
   changelog entry as the body, so release-please recognises the tag as released.
   **This is the first irreversible step — a published version is permanent.**
   Every later version comes from the Release PR instead; see `docs/release.md`.
5. Once the package exists on npm, configure the Trusted Publisher: `npm trust github
   --allow-publish` against this package, or npmjs.com → package → *Access* → Trusted Publishers with
   owner `iamfj`, repo `n8n-nodes-paperless-ngx`, workflow `release.yml` and no environment.
   `--allow-publish` is mandatory for publishers created after 2026-05-20. Then delete the
   `NPM_TOKEN` secret — `release.yml` handles both paths, and leaving `NPM_TOKEN` unset selects OIDC.
   Confirm OIDC works on the next real release before relying on it.
6. Sign up at <https://creators.n8n.io/nodes> and submit the package.

Ship `0.1.0` first rather than jumping to `1.0.0`: it buys real scanner output cheaply, and n8n does
not require a 1.x version for verification.
