import { PaperlessNgxApi } from '../credentials/PaperlessNgxApi.credentials';

const credential = new PaperlessNgxApi();
const propertyNamed = (name: string) =>
	credential.properties.find((property) => property.name === name);

describe('credential properties', () => {
	it('masks the API token in the UI', () => {
		expect(propertyNamed('apiToken')?.typeOptions?.password).toBe(true);
	});

	it('offers Auto alongside both live API versions', () => {
		const apiVersion = propertyNamed('apiVersion');
		expect(apiVersion?.default).toBe('auto');
		expect(apiVersion?.options?.map((option) => 'value' in option && option.value)).toEqual([
			'auto',
			'10',
			'9',
		]);
	});

	it('points at the Paperless-ngx API documentation', () => {
		expect(credential.documentationUrl).toBe('https://docs.paperless-ngx.com/api/');
	});
});

describe('authenticate', () => {
	it('sends the Token scheme Paperless expects, not Bearer', () => {
		expect(credential.authenticate.properties.headers?.Authorization).toBe(
			'=Token {{$credentials.apiToken}}',
		);
	});

	it('sets no Accept header, leaving version negotiation to the client', () => {
		expect(credential.authenticate.properties.headers).not.toHaveProperty('Accept');
	});

	it('honours the insecure-TLS toggle', () => {
		expect(credential.authenticate.properties.skipSslCertificateValidation).toBe(
			'={{$credentials.ignoreSslIssues}}',
		);
	});
});

describe('credential test request', () => {
	it('checks the token against the profile endpoint on the configured instance', () => {
		expect(credential.test.request).toMatchObject({
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/profile/',
			method: 'GET',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		});
	});

	it('asserts a pinned version but lets Auto take whatever the server serves', () => {
		// Auto must not pin: the client recovers from a 406 by retrying lower and a
		// static header here cannot, so pinning would fail the test for a v9-only
		// server the node handles perfectly well.
		const accept = credential.test.request.headers?.Accept as string;
		expect(accept).toBe(
			'={{$credentials.apiVersion === "auto" ? "application/json" : "application/json; version=" + $credentials.apiVersion}}',
		);
	});
});
