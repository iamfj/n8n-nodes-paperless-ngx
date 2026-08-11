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
				// Dependabot's grouped dev-dependency PRs commit as `chore(deps-dev)`.
				'deps-dev',
			],
		],
	},
};
