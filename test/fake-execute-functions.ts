import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { vi } from 'vitest';

/** Shape n8n returns when a request is made with `returnFullResponse: true`. */
export interface FakeResponse {
	statusCode: number;
	headers: Record<string, string>;
	body: unknown;
}

const defaultNode: INode = {
	id: 'a1b2c3d4-0000-4000-8000-000000000000',
	name: 'Paperless-ngx',
	type: 'n8n-nodes-paperless-ngx.paperlessNgx',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const defaultCredentials = {
	baseUrl: 'https://paperless.example.com',
	apiToken: 'test-token',
	apiVersion: 'auto',
	allowUnauthorizedCerts: false,
};

/**
 * The client's only seam is the `IExecuteFunctions` it is handed, so the fake is
 * that object and nothing more. Only the members the client actually touches are
 * implemented; the cast covers the rest of the interface deliberately.
 *
 * The returned `http` mock is the assertion target: what matters is the options
 * object the client passes to n8n, since that is the whole of our contract.
 */
export function createFakeExecuteFunctions(
	overrides: {
		credentials?: Record<string, unknown>;
		node?: Partial<INode>;
		binaryBuffer?: Buffer;
	} = {},
) {
	const http = vi.fn<(...args: unknown[]) => Promise<unknown>>();
	const node: INode = { ...defaultNode, ...overrides.node };

	const ctx = {
		getNode: () => node,
		getCredentials: vi.fn(async () => ({ ...defaultCredentials, ...overrides.credentials })),
		helpers: {
			httpRequestWithAuthentication: http,
			getBinaryDataBuffer: vi.fn(async () => overrides.binaryBuffer ?? Buffer.from('%PDF-1.7')),
			assertBinaryData: vi.fn(() => ({ fileName: 'invoice.pdf', mimeType: 'application/pdf' })),
			prepareBinaryData: vi.fn(async (data: Buffer, fileName?: string) => ({
				data: data.toString('base64'),
				fileName,
				mimeType: 'application/pdf',
			})),
		},
	} as unknown as IExecuteFunctions;

	return { ctx, http };
}
