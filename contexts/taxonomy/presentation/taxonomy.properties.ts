import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { resourceLocator } from '../../../shared/presentation/resource-locator';
import {
	MATCHING_ALGORITHMS,
	type TaxonomyDescriptor,
	type TaxonomyField,
} from '../domain/taxonomy';

export function taxonomyOperations(descriptor: TaxonomyDescriptor): INodePropertyOptions[] {
	// n8n's UX guidelines put operation descriptions and actions in sentence case,
	// so both interpolate the lowercased display name; only `name` stays title case.
	const singular = descriptor.displayName.toLowerCase();
	const plural = descriptor.pluralDisplayName.toLowerCase();
	return [
		{
			name: 'Create',
			value: 'create',
			description: `Create a new ${singular}`,
			action: `Create a ${singular}`,
		},
		{
			name: 'Delete',
			value: 'delete',
			description: `Delete a ${singular}`,
			action: `Delete a ${singular}`,
		},
		{
			name: 'Get',
			value: 'get',
			description: `Retrieve a single ${singular} by ID`,
			action: `Get a ${singular}`,
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: `List ${plural}`,
			action: `Get many ${plural}`,
		},
		{
			name: 'Update',
			value: 'update',
			description: `Change an existing ${singular}`,
			action: `Update a ${singular}`,
		},
	];
}

// n8n's UX guidelines want a collection's entries in alphabetical order. These
// lists are assembled from a descriptor rather than written out, so they are
// sorted rather than hand-ordered.
function sorted(properties: INodeProperties[]): INodeProperties[] {
	return [...properties].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function toProperty(field: TaxonomyField): INodeProperties {
	return {
		displayName: field.displayName,
		name: field.name,
		type: field.type,
		default: field.default,
		description: field.description,
	};
}

const matchingFields: INodeProperties[] = [
	{
		displayName: 'Match',
		name: 'match',
		type: 'string',
		default: '',
		description: 'Text or pattern the matching algorithm looks for in a document',
	},
	{
		displayName: 'Matching Algorithm',
		name: 'matchingAlgorithm',
		type: 'options',
		default: 0,
		description: 'How Paperless-ngx decides that a document matches',
		options: [...MATCHING_ALGORITHMS],
	},
	{
		displayName: 'Match Case Insensitively',
		name: 'isInsensitive',
		type: 'boolean',
		default: true,
		description: 'Whether matching ignores letter case',
	},
];

export function taxonomyFields(descriptor: TaxonomyDescriptor): INodeProperties[] {
	const resource = [descriptor.resource];
	const singular = descriptor.displayName;
	const lower = singular.toLowerCase();
	const showFor = (operations: string[]) => ({ show: { resource, operation: operations } });
	const extras = descriptor.extraFields.map(toProperty);

	return [
		{
			...resourceLocator({
				displayName: singular,
				name: 'taxonomyId',
				searchListMethod: descriptor.listSearchMethod,
				description: `The ${lower} to act on`,
				required: true,
			}),
			displayOptions: showFor(['get', 'update', 'delete']),
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			required: true,
			default: '',
			displayOptions: showFor(['create']),
			description: `Name of the new ${lower}`,
		},
		// A required extra field (StoragePath's `path`) has to stand outside the
		// collection: n8n only validates `required` on a top-level property, and a
		// StoragePath without a path is rejected by the serializer.
		...descriptor.extraFields
			.filter((field) => field.required)
			.map((field) => ({
				...toProperty(field),
				required: true,
				displayOptions: showFor(['create']),
			})),
		{
			displayName: 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: 'Add field',
			default: {},
			displayOptions: showFor(['create']),
			options: sorted([
				...extras.filter((field) => !isRequired(descriptor, field)),
				...matchingFields,
			]),
		},
		{
			displayName: 'Update Fields',
			name: 'updateFields',
			type: 'collection',
			placeholder: 'Add field',
			default: {},
			displayOptions: showFor(['update']),
			options: sorted([
				{
					displayName: 'Name',
					name: 'name',
					type: 'string',
					default: '',
					description: `New name for the ${lower}`,
				},
				...extras,
				...matchingFields,
			]),
		},
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			displayOptions: showFor(['getMany']),
			description: 'Whether to return all results or only up to a given limit',
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			displayOptions: { show: { resource, operation: ['getMany'], returnAll: [false] } },
			description: 'Max number of results to return',
		},
		{
			displayName: 'Filters',
			name: 'filters',
			type: 'collection',
			placeholder: 'Add filter',
			default: {},
			displayOptions: showFor(['getMany']),
			options: [
				{
					displayName: 'Name Contains',
					name: 'nameContains',
					type: 'string',
					default: '',
					description: `Only ${descriptor.pluralDisplayName.toLowerCase()} whose name contains this text`,
				},
			],
		},
	];
}

function isRequired(descriptor: TaxonomyDescriptor, property: INodeProperties): boolean {
	return descriptor.extraFields.some((field) => field.name === property.name && field.required);
}
