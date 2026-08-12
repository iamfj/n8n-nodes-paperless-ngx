import type { INode, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { locatorId } from '../domain/load-options';

/**
 * A single-value reference picker, which n8n's UX guidelines ask for wherever one
 * is possible. The `list` mode searches server-side through `methods.listSearch`;
 * a plain `options` dropdown cannot, because it receives the whole list in one
 * fetch and has to cap it.
 *
 * Multi-select references stay `multiOptions` with `loadOptionsMethod`: n8n has
 * no multi-value resourceLocator.
 */
export function resourceLocator(spec: {
	displayName: string;
	name: string;
	searchListMethod: string;
	description: string;
	required?: boolean;
}): INodeProperties {
	return {
		displayName: spec.displayName,
		name: spec.name,
		type: 'resourceLocator',
		required: spec.required === true,
		default: { mode: 'list', value: '' },
		description: spec.description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: spec.searchListMethod, searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: '42',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[1-9][0-9]*$',
							errorMessage: 'The ID must be a whole number greater than zero',
						},
					},
				],
			},
		],
	};
}

/**
 * The ID a required picker carries. An empty locator reaches execute as `''`, and
 * without this it would be pasted into the URL as `undefined` and come back as a
 * 404 that blames the base URL.
 */
export function requiredLocatorId(
	node: INode,
	raw: unknown,
	displayName: string,
	itemIndex: number,
): number {
	const id = locatorId(raw);
	if (id === undefined) {
		throw new NodeOperationError(node, `No ${displayName} was selected`, {
			itemIndex,
			description: `Pick one from the list, or switch the field to By ID and enter the numeric ${displayName}.`,
		});
	}
	return id;
}
