import { createFakeExecuteFunctions } from './fake-execute-functions';
import { documentsPageV10, headersV10 } from './fixtures/paperless';

// Proves the harness itself works: vitest globals are on, TS fixtures load, and
// the fake context hands back a programmed response. Real client tests replace
// the direct `http` call below with a call into the shared kernel.
describe('test harness', () => {
	it('returns the canned response the fake was programmed with', async () => {
		const { ctx, http } = createFakeExecuteFunctions();
		http.mockResolvedValue({ statusCode: 200, headers: headersV10, body: documentsPageV10 });

		const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'paperlessNgxApi', {
			method: 'GET',
			url: 'https://paperless.example.com/api/documents/',
		});

		expect(response).toMatchObject({ statusCode: 200, body: { count: 31 } });
		expect(http).toHaveBeenCalledTimes(1);
	});
});
