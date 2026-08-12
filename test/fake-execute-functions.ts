import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	IWebhookFunctions,
} from 'n8n-workflow';
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

// Field names mirror PaperlessNgxApi.credentials.ts exactly; the client reads
// them straight off `getCredentials`, so a drift here would pass silently.
const defaultCredentials = {
	baseUrl: 'https://paperless.example.com',
	apiToken: 'test-token',
	apiVersion: 'auto',
	ignoreSslIssues: false,
};

/**
 * The client's only seam is the `IExecuteFunctions` it is handed, so the fake is
 * that object and nothing more. Only the members the client and the contexts
 * actually touch are implemented; the cast covers the rest of the interface
 * deliberately.
 *
 * The returned `http` mock is the assertion target: what matters is the options
 * object the client passes to n8n, since that is the whole of our contract.
 */
export function createFakeExecuteFunctions(
	overrides: {
		credentials?: Record<string, unknown>;
		node?: Partial<INode>;
		binaryBuffer?: Buffer;
		/** Values `getNodeParameter` resolves, keyed exactly as the node names them. */
		parameters?: Record<string, unknown>;
		items?: INodeExecutionData[];
		continueOnFail?: boolean;
	} = {},
) {
	const http = vi.fn<(...args: unknown[]) => Promise<unknown>>();
	const node: INode = { ...defaultNode, ...overrides.node };
	const parameters = overrides.parameters ?? {};

	const ctx = {
		getNode: () => node,
		getCredentials: vi.fn(async () => ({ ...defaultCredentials, ...overrides.credentials })),
		getInputData: vi.fn(() => overrides.items ?? [{ json: {} }]),
		continueOnFail: vi.fn(() => overrides.continueOnFail ?? false),
		// n8n throws when a parameter is absent and no fallback was given, and a
		// context relying on that difference is a bug worth failing the test for.
		// Only `loadOptions` contexts have these, and the client is now shared with
		// the dropdown pickers — so the fake stands in for both interfaces.
		getCurrentNodeParameter: vi.fn((name: string) => parameters[name]),
		getCurrentNodeParameters: vi.fn(() => parameters),
		getNodeParameter: vi.fn((name: string, _itemIndex: number, fallback?: unknown) => {
			if (name in parameters) {
				return parameters[name];
			}
			if (fallback !== undefined) {
				return fallback;
			}
			throw new Error(`fake getNodeParameter: "${name}" was not provided and has no fallback`);
		}),
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
	} as unknown as IExecuteFunctions & ILoadOptionsFunctions;

	return { ctx, http };
}

/**
 * The trigger's own seams: the activation hooks and the incoming webhook. A
 * separate factory rather than more overrides on the one above, because
 * `getNodeParameter` takes no item index here — the hook interfaces read
 * `(name, fallback)` — and a shared implementation would hide that difference.
 *
 * `staticData` is handed back by reference on purpose: the hooks write into it,
 * and a test asserting what activation stored is asserting on that object.
 */
export function createFakeHookFunctions(
	overrides: {
		credentials?: Record<string, unknown>;
		node?: Partial<INode>;
		parameters?: Record<string, unknown>;
		staticData?: IDataObject;
		/** `'manual'` is what n8n reports for a "Listen for test event" run. */
		mode?: string;
		webhookUrl?: string;
		body?: IDataObject;
		headers?: Record<string, string>;
	} = {},
) {
	const http = vi.fn<(...args: unknown[]) => Promise<unknown>>();
	const node: INode = {
		...defaultNode,
		name: 'Paperless-ngx Trigger',
		type: 'n8n-nodes-paperless-ngx.paperlessNgxTrigger',
		webhookId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
		...overrides.node,
	};
	const parameters = overrides.parameters ?? {};
	const staticData: IDataObject = overrides.staticData ?? {};

	const ctx = {
		getNode: () => node,
		getCredentials: vi.fn(async () => ({ ...defaultCredentials, ...overrides.credentials })),
		getMode: vi.fn(() => overrides.mode ?? 'trigger'),
		getActivationMode: vi.fn(() => 'activate'),
		getWorkflowStaticData: vi.fn(() => staticData),
		getNodeWebhookUrl: vi.fn(
			() => overrides.webhookUrl ?? 'https://n8n.example.com/webhook/abc/webhook',
		),
		getNodeParameter: vi.fn((name: string, fallback?: unknown) =>
			name in parameters ? parameters[name] : fallback,
		),
		getBodyData: vi.fn(() => overrides.body ?? {}),
		getHeaderData: vi.fn(() => overrides.headers ?? {}),
		helpers: {
			httpRequestWithAuthentication: http,
			returnJsonArray: (items: IDataObject[]) => items.map((json) => ({ json })),
		},
	} as unknown as IHookFunctions & IWebhookFunctions;

	return { ctx, http, node, staticData };
}
