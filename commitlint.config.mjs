export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'scope-enum': [
			2,
			'always',
			[
				// Paperless-ngx resource domains
				'archive',
				'ingestion',
				'taxonomy',
				'sharing',
				'automation',
				'access',
				'system',
				// Package layers
				'shared',
				'credentials',
				'node',
				// Repo plumbing
				'ci',
				'docs',
				'deps',
				// For hand-written dev-tooling bumps. Renovate never emits it: its
				// subjects are pinned to `chore(deps)` / `ci(deps)`.
				'deps-dev',
			],
		],
	},
};
