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
				// Kept for the Dependabot-era history; Renovate is configured to
				// commit as `chore(deps)` / `ci(deps)` instead.
				'deps-dev',
			],
		],
	},
};
