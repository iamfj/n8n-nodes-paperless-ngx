import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Globals on: the kernel tests read better without an import line of
		// describe/it/expect in every file, and `vi` is needed in almost all of them.
		globals: true,
		include: ['test/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			// text for the CI log, lcov for any external coverage viewer.
			reporter: ['text', 'lcov'],
			// No threshold on purpose. A number picked against a skeleton measures
			// nothing and only ever gets lowered to keep the build green.
			// An allowlist of the shipped source. dist, test and the config files
			// fall outside it by construction, so they need no exclude entry.
			include: ['contexts/**', 'credentials/**', 'nodes/**', 'shared/**'],
			// The node's *.node.json is n8n metadata, not executable code.
			exclude: ['**/*.d.ts', '**/*.test.ts', '**/*.json'],
		},
	},
});
