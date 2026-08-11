## What and why

<!-- What changes, and what problem it solves. Link the issue: Closes #NN -->

## Verification

- [ ] **Zero runtime dependencies** — nothing added to `dependencies`; new packages are devDependencies
- [ ] **No `fs`, no `process.env`** — n8n's scanner rejects filesystem and environment access
- [ ] **Layer rule** — nothing under `shared/domain/` imports `n8n-workflow`
- [ ] **Tests added** for the new behaviour, using the fake context rather than real HTTP
- [ ] **`npm run lint`, `npm run typecheck`, `npm run typecheck:test`, `npm test`, `npm run build` all pass**
- [ ] **Conventional commit** title, so the changelog reads correctly
- [ ] **No credential value can reach logs, errors, or node output**

## Paperless-ngx compatibility

<!-- Delete if not applicable. -->

- API versions tested: <!-- 9 / 10 / both -->
- Paperless-ngx version tested against:
- [ ] Response shape confirmed against the upstream serializer, not guessed

## Scanner

`@n8n/scan-community-package` only accepts a **published** package name, so it
cannot run against a branch. Note here if this change could affect it — new imports,
new globals, changes to `files` or the `n8n` block in `package.json`.

- [ ] Nothing here affects the scanner, **or** it was checked after the last release
