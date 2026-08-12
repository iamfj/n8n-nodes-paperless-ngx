// Asserts what the published tarball actually contains, because nothing else
// does: `files: ["dist"]` is a promise about a directory, not about the files
// n8n needs to find inside it, and a packaging mistake only surfaces as a node
// that silently fails to load on someone else's instance.
//
// Plain node, no dependency, and deliberately not a lifecycle script --
// `prepare`/`postinstall` are rejected by n8n Cloud verification.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const failures = [];

function check(condition, message) {
	if (!condition) {
		failures.push(message);
	}
}

// `npm pack --dry-run` writes no tarball but reports the exact file list npm
// would publish, which is the only source of truth here: `files`, .npmignore and
// npm's own always-included set all feed into it.
const packed = JSON.parse(
	execFileSync('npm', ['pack', '--dry-run', '--json'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	}),
);
const files = new Set(packed[0].files.map((entry) => entry.path));

// The entry points n8n reads out of the `n8n` block. A path listed there but
// missing from the tarball is a node that does not load at all.
for (const path of [...(pkg.n8n?.nodes ?? []), ...(pkg.n8n?.credentials ?? [])]) {
	check(files.has(path), `${path} is declared in package.json#n8n but is not in the tarball`);
}

// tsc emits neither the codex file nor the icons -- `n8n-node build` copies them.
// If that ever stops, the node still loads, just without an icon and without the
// documentation links, which is the kind of regression nobody notices. The codex
// list is derived from `n8n.nodes` rather than written out again, so a node added
// there cannot be forgotten here.
const codexFiles = (pkg.n8n?.nodes ?? []).map((path) => path.replace(/\.js$/, '.json'));

for (const path of [
	...codexFiles,
	'dist/nodes/PaperlessNgx/paperless.svg',
	'dist/nodes/PaperlessNgx/paperless.dark.svg',
]) {
	check(files.has(path), `${path} is missing from the tarball`);
}

check(
	Object.keys(pkg.dependencies ?? {}).length === 0,
	'dependencies must stay empty: n8n Cloud verification rejects runtime dependencies',
);

// The regression guard this script was written for. `@n8n/community-nodes/
// valid-peer-dependencies` requires the peer dependency and its `*` range, so
// removing it is not an option -- but plain npm (which is what the manual
// `cd ~/.n8n/nodes && npm i` path runs) auto-installs peers, planting a second
// n8n-workflow that beats n8n's own via the node_modules walk-up. Marking it
// optional in peerDependenciesMeta is what stops npm installing it; the lint
// rule never looks at that block. Drop the meta entry and the manual install
// path silently regresses, which is exactly the failure nobody would catch.
check(
	pkg.peerDependencies?.['n8n-workflow'] === '*',
	'peerDependencies must declare "n8n-workflow": "*" — @n8n/community-nodes/valid-peer-dependencies requires it',
);
check(
	pkg.peerDependenciesMeta?.['n8n-workflow']?.optional === true,
	'peerDependenciesMeta must mark n8n-workflow optional, or npm auto-installs a copy that shadows n8n’s own on the manual install path',
);

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`✗ ${failure}`);
	}
	process.exit(1);
}

console.log(`✓ package contents verified (${files.size} files)`);
