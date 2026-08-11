import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { PaperlessError } from '../shared/domain/paperless-error';
import { toNodeError } from '../shared/infrastructure/error-mapper';
import { createFakeExecuteFunctions } from './fake-execute-functions';
import { detailError, fieldValidationError } from './fixtures/paperless';

const node = createFakeExecuteFunctions().ctx.getNode();

describe('toNodeError', () => {
	it('maps a PaperlessError to a NodeApiError with the hint as description', () => {
		const error = toNodeError(
			node,
			new PaperlessError({
				method: 'GET',
				url: 'https://paperless.example.com/api/documents/999/',
				status: 404,
				body: detailError,
			}),
			2,
		) as NodeApiError;

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.description).toContain('/api');
		// n8n types this as a string despite it being a status code.
		expect(error.httpCode).toBe('404');
		expect(error.context.itemIndex).toBe(2);
	});

	it('carries the validation detail into the message n8n shows', () => {
		const error = toNodeError(
			node,
			new PaperlessError({
				method: 'POST',
				url: 'https://paperless.example.com/api/documents/',
				status: 400,
				body: fieldValidationError,
			}),
		);

		expect(error.message).toContain('This field may not be blank.');
	});

	it('never hands n8n the raw cause, which carries the request headers', () => {
		const error = toNodeError(
			node,
			new PaperlessError({
				method: 'GET',
				url: 'https://paperless.example.com/api/profile/',
				status: 0,
				body: undefined,
				cause: Object.assign(new Error('socket hang up'), {
					config: { headers: { Authorization: 'Token test-token' } },
				}),
			}),
		);

		expect(JSON.stringify(error)).not.toContain('test-token');
	});

	it('falls back to an operation error for anything not from the client', () => {
		expect(toNodeError(node, new Error('boom'))).toBeInstanceOf(NodeOperationError);
		expect(toNodeError(node, 'boom')).toBeInstanceOf(NodeOperationError);
	});
});
