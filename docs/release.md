# How a release is cut

Nothing about a release is done by hand except merging one pull request. The version bump and the
changelog are computed from the conventional commits `commitlint.config.mjs` already enforces, and
`.github/workflows/release.yml` carries the whole path from merge to published package.

## The loop

1. **Merge anything to `main`.** `release.yml` runs release-please, which reads every commit since
   the last tag and opens or updates a single `chore: release X.Y.Z` pull request. That PR bumps
   `package.json` and `package-lock.json` and prepends a `CHANGELOG.md` entry. It stays open and
   keeps updating itself for as long as you keep merging.
2. **Review it like any other PR.** The changelog it proposes is the release note a user reads.
3. **Squash-merge it — with the admin bypass.** See below; this is expected, not a workaround.
4. The same workflow run then tags the merge commit and continues into the `publish` job: lint,
   typecheck, typecheck tests, test, build, `verify:package`, an assertion that `package.json`
   matches the tag, then `npm publish` with a provenance attestation.
5. The `scan` job runs `@n8n/scan-community-package` against the version that was just published.
   Its first assertion is provenance, so a green scan is the proof the release is eligible for n8n
   Cloud verification. It runs with no token, no secret and no checkout.

## Why the Release PR needs an admin bypass

The `main` ruleset requires the `Node 20` and `Node 22` checks. release-please opens its PR with the
workflow's `GITHUB_TOKEN`, and GitHub deliberately does not start a workflow run from an event
raised by that token — so `ci.yml` never fires on the Release PR and its required checks stay
pending forever. Merging it therefore needs the ruleset's admin bypass, every time.

Do not "fix" this by dropping the required checks or by loosening the ruleset. The gates are not
lost: the `publish` job reruns all five plus `verify:package` on the merge commit before it
publishes anything, which is why they are listed there explicitly rather than left to `ci.yml`.

The same rule is why publishing lives inside `release.yml` instead of a separate tag-triggered
workflow: a tag pushed with `GITHUB_TOKEN` cannot start one.

## The escape hatch

`release.yml` also triggers on a pushed `*.*.*` tag. release-please's own tags never reach it (see
above), so in practice this path only ever matches a tag pushed by hand:

```sh
git tag 0.2.1 && git push origin 0.2.1
```

The `publish` job asserts `package.json#version` equals the tag before it publishes, so a tag
pointing at the wrong commit fails loudly rather than publishing the wrong version. This is the path
the first release used, and the one to use if release-please is ever unavailable.

## Credentials

The publish step takes one of two paths. With no `NPM_TOKEN` repository secret it publishes through
the npm Trusted Publisher — owner `iamfj`, repo `n8n-nodes-paperless-ngx`, workflow `release.yml` —
where the OIDC token minted by `id-token: write` is the credential and no secret exists to leak. If
`NPM_TOKEN` is set, the step writes it to a `$RUNNER_TEMP` npmrc instead and deletes it on the way
out. That branch exists because a Trusted Publisher cannot be configured for a package that does not
exist yet
([npm docs](https://docs.npmjs.com/cli/v11/commands/npm-trust/): "the package you're configuring must
already exist"), so `0.1.0` went out on a token and the secret was deleted immediately after. Leave
it deleted: npm is retiring direct publishing from 2FA-bypass tokens in January 2027
([changelog](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)),
and OIDC is the path that survives it.

## Housekeeping

- `include-v-in-tag: false` and `include-component-in-tag: false` — the tag *is* the npm version,
  which is what the scan job passes to `@n8n/scan-community-package`, what the `'*.*.*'` trigger
  matches, and what the publish job asserts `package.json#version` equals. Both default the other
  way in manifest mode
  ([manifest-releaser.md](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)),
  and the component is the package name with the scope stripped, so leaving the second one out tags
  `n8n-nodes-paperless-ngx-0.2.0` and fails that assertion.
- `bump-minor-pre-major: true` — pre-1.0, a stray `feat!` must not jump the package to `1.0.0`.
- `pull-request-title-pattern` overrides release-please's default `chore(main): release …`: `main`
  is not in `commitlint.config.mjs`'s `scope-enum`, and a squash-merge makes the PR title the commit
  message.
- `CHANGELOG.md` and `.release-please-manifest.json` are excluded from Biome in `biome.jsonc`. Both
  are machine-written on the Release PR branch, in whatever indentation release-please chooses.
- Which commit types appear in the changelog is `changelog-sections` in `release-please-config.json`.
  `feat`, `fix`, `perf`, `revert`, `docs` and `refactor` are visible; the rest are hidden from the
  changelog.

## n8n Cloud verification

`npm run lint` and `npm run verify:package` enforce everything n8n's guidelines can be enforced from
a repository — the four hard blockers in `AGENTS.md` are the ones that matter — and the `scan` job
proves provenance landed on the published version. What no check here covers, and what a submission
is judged on besides:

- the npm account that publishes and the GitHub maintainer must be the same identity
- English-only UI strings, documentation links in the codex, example workflows in the README
- the node must not duplicate an already-verified integration

Read the requirements from the source rather than a copy of it:
[verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)
and [submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes).
Submissions go through <https://creators.n8n.io/nodes>.
