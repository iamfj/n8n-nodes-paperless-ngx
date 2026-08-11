import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class PaperlessNgxApi implements ICredentialType {
	name = 'paperlessNgxApi';
	displayName = 'Paperless-Ngx API';
	documentationUrl = 'https://docs.paperless-ngx.com/api/';
	icon: Icon = {
		light: 'file:../nodes/PaperlessNgx/paperless.svg',
		dark: 'file:../nodes/PaperlessNgx/paperless.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://paperless.example.com',
			description:
				'Root URL of your Paperless-ngx instance, without a trailing slash and without the /api suffix',
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'Token issued by Paperless-ngx. Create or copy it in the web UI under My Profile → API Token.',
		},
		{
			displayName: 'API Version',
			name: 'apiVersion',
			type: 'options',
			default: 'auto',
			options: [
				{ name: 'Auto', value: 'auto' },
				{ name: '10', value: '10' },
				{ name: '9', value: '9' },
			],
			description:
				'REST API version to request. Auto asks for the newest supported version and falls back automatically if the server rejects it. Pin a version if your workflows depend on a specific response shape.',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if the TLS certificate cannot be verified, as is common for self-hosted instances using a self-signed certificate',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
			// Accept is deliberately not set here. The API version is negotiated per
			// request by the client, which needs to retry a 406 with a lower version —
			// something a static credential header cannot do. See
			// docs/architecture/shared-kernel.md.
			headers: {
				Authorization: '=Token {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/profile/',
			method: 'GET',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
	};
}
