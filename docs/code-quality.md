# Code quality toolchain

Two tools, no overlap. Please read this before "simplifying" by deleting one.

## Why both

`package.json` sets `"n8n": { "strict": true }`. Strict mode is **required for n8n Cloud
verification**, and `n8n-node lint` enforces it by reading `eslint.config.mjs` and comparing it,
whitespace-normalised, against its own bundled template. Any deviation — narrowing `files`, adding a
rule, adding an ignore — prints `Strict mode violation` and exits 1.

So `eslint.config.mjs` is effectively **read-only**. It is not ours to tune.

## Who owns what

| Concern | Owner |
| --- | --- |
| Formatting (all JS/TS/JSON) | Biome |
| Import ordering | Biome |
| Lint: `nodes/**`, `credentials/**` | ESLint only |
| Lint: `shared/**`, `contexts/**` | ESLint + a 4-rule Biome set |

ESLint's config applies to `**/*.ts`, so it lints the whole repo, including `shared/` and
`contexts/`. That is deliberate: the `@n8n/eslint-plugin-community-nodes` rules that enforce
verification constraints (banned imports like `fs`, runtime-dependency rules) must see *every* file.
Scoping ESLint away from the pure-TypeScript layers would hide real verification blockers to buy
nothing but tidiness.

Because ESLint already covers those paths, Biome's linter is off by default and opted into per-path
in `biome.jsonc`. It enables only four rules, chosen because typescript-eslint's recommended set does
**not** include them:

- `style/useConst` — `prefer-const` is not in `eslint:recommended`.
- `performance/noBarrelFile`, `performance/noReExportAll` — nothing in the ESLint config restricts
  barrel-file re-export sprawl.
- `correctness/noUnusedImports` — overlaps `no-unused-vars`, but unlike ESLint it has a safe autofix,
  so the pre-commit hook deletes dead imports before ESLint ever reports them.

Anything typescript-eslint already catches (`no-explicit-any`, `no-unused-vars`) is intentionally
left out of Biome. A duplicated rule is the same error printed twice.

## Installing the git hooks — manual, one time

```sh
npm run hooks:install
```

**`npm install` does not do this for you.** Community node packages may not declare `prepare` or
`postinstall` scripts — `@n8n/community-nodes/no-forbidden-lifecycle-scripts` rejects them — so the
usual auto-install pattern is unavailable. Until you run the command above, committing and pushing
silently skips every check in `lefthook.yml`, which looks exactly like passing. Lefthook does
re-sync itself on later `lefthook run` invocations, so this is only needed once per clone.

## When they disagree

**ESLint wins.** It is the verification gate; Biome is a convenience. Formatting is not a real
conflict — the n8n ESLint config contains no formatting rules at all, so Biome is uncontested there.

One sharp edge: `n8n-node` rewrites `package.json` through Prettier with only `{ parser: 'json' }`,
ignoring any config file, so it always emits 2-space indent. `biome.jsonc` has a `package.json`
override matching that. Remove it and every CLI-driven `package.json` edit churns the diff.

## Why `@n8n/scan-community-package` is not in the hooks

It resolves a package **by name from the npm registry** and its first check is npm provenance, so it
only works against an already-published release — pointed at this working tree it 404s every time.
It belongs after a release, not before a push. `npm run lint` covers the same class of verification
blocker locally and offline.

## Dependency updates and the supply chain

**Renovate opens the update PRs; Dependabot only reports.** Dependabot's *alerts* stay enabled at the
repo level — they are the detector Renovate's `vulnerabilityAlerts` reads. Its two PR-opening halves
are off: `.github/dependabot.yml` is deleted (version updates) and automated security fixes are
disabled via
`gh api -X DELETE repos/iamfj/n8n-nodes-paperless-ngx/automated-security-fixes`. Re-enabling either
does not add coverage, it just races Renovate for the same bump.

Config lives in `.github/renovate.json5`. Three settings are load-bearing and should not be
relaxed without a reason written down next to them:

- **`minimumReleaseAge: '3 days'`.** A stolen maintainer token and a malicious `postinstall` is the
  dominant npm attack; those releases are usually yanked within hours. Sitting out three days means
  the registry absorbs that window instead of this repo. `internalChecksFilter: 'strict'` — already
  Renovate's default — is written out beside it so a change to that default cannot quietly turn the
  cooldown into a PR annotation. `vulnerabilityAlerts` exempts itself from the cooldown: a published
  fix for a known hole should not wait. The top-level `schedule` is daily, not weekly, because it
  gates branch updates as well as PR creation, and a weekly window would add up to a full extra week
  on top of the three days. The cooldown has one hole: it does not apply to `lockFileMaintenance`,
  where npm resolves the tree itself, so the monthly lockfile PR — devDependencies only, since the
  package ships none at runtime — can pull a version published that morning. Read that one as a
  diff of versions, not as a list of changelogs.
- **`pinDigests` on GitHub Actions.** A version tag is mutable; whoever owns the action's repo can
  repoint `v7` at any commit and it runs on the next push. Both workflows pin to a commit SHA with
  the human-readable version in a trailing comment, which is what Renovate reads to offer upgrades.
- **`npm ci --ignore-scripts` in `release.yml`.** That job holds `id-token: write` and npm publish
  rights. An install script running there could alter `dist/` *before* the provenance attestation is
  minted, and the attestation would then vouch for the tampered build. CI already installs this way.
  The `npx @n8n/scan-community-package` step after it is pinned to an exact version for the same
  reason — a floating `npx` name runs whatever was published minutes ago, install scripts included —
  and the publish token is written to a `$RUNNER_TEMP` npmrc rather than `~/.npmrc`, which no later
  step reads by default. That file would outlive the step, so an `EXIT` trap deletes it however the
  release exits — the location alone does not keep it from the scanner.

Renovate's commit subjects are pinned to `chore(deps)` / `ci(deps)` because `commitlint.config.mjs`
enforces a closed `scope-enum`; the defaults would produce scopes it rejects.

Renovate runs as the GitHub App, installed against this repository only. There is no `renovate.json`
in the repo root — the config is under `.github/` alongside the other bot and workflow files.

## Gaps

Biome does not format Markdown, so `*.md` is unformatted since Prettier was removed.
