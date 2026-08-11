import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import type { Capability } from '../domain/api-version';
import type { PaperlessClient } from './paperless-client';

// Types only, no body. The factory gets written once three contexts exist and the
// duplication it is meant to remove is visible; writing it against a single
// caller would encode that caller's shape as the abstraction.

export type OperationSpec = {
	value: string;
	name: string;
	description: string;
	/** n8n's AI-tool action label, e.g. "Get a document". */
	action: string;
	properties?: INodeProperties[];
	/** Declared here so the factory can fail early instead of the server 404ing. */
	requires?: Capability;
	run(
		ctx: IExecuteFunctions,
		client: PaperlessClient,
		itemIndex: number,
	): Promise<INodeExecutionData | INodeExecutionData[]>;
};

export type ResourceSpec = {
	value: string;
	name: string;
	description: string;
	operations: OperationSpec[];
};

export type ResourceDefinition = {
	properties: INodeProperties[];
	execute(ctx: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData[]>;
};

export declare function defineResource(spec: ResourceSpec): ResourceDefinition;
