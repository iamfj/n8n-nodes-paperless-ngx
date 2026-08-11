import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	MATCHING_ALGORITHMS,
	type TaxonomyDescriptor,
	type TaxonomyField,
} from '../domain/taxonomy';

export function taxonomyOperations(descriptor: TaxonomyDescriptor): INodePropertyOptions[] {
	const singular = descriptor.displayName;
	return [
		{
			name: 'Create',
			value: 'create',
			description: `Create a new ${singular}`,
			action: `Create a ${singular.toLowerCase()}`,
		},
		{
			name: 'Delete',
			value: 'delete',
			description: `Delete a ${singular}`,
			action: `Delete a ${singular.toLowerCase()}`,
		},
		{
			name: 'Get',
			value: 'get',
			description: `Retrieve a single ${singular} by ID`,
			action: `Get a ${singular.toLowerCase()}`,
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: `List ${descriptor.pluralDisplayName}`,
			action: `Get many ${descriptor.pluralDisplayName.toLowerCase()}`,
		},
		{
			name: 'Update',
			value: 'update',
			description: `Change an existing ${singular}`,
			action: `Update a ${singular.toLowerCase()}`,
		},
	];
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
	const showFor = (operations: string[]) => ({ show: { resource, operation: operations } });
	const extras = descriptor.extraFields.map(toProperty);

	return [
		{
			displayName: `${singular} ID`,
			name: 'taxonomyId',
			type: 'number',
			required: true,
			default: 0,
			typeOptions: { minValue: 1 },
			displayOptions: showFor(['get', 'update', 'delete']),
			description: `ID of the ${singular}`,
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			required: true,
			default: '',
			displayOptions: showFor(['create']),
			description: `Name of the new ${singular}`,
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
			options: [...extras.filter((field) => !isRequired(descriptor, field)), ...matchingFields],
		},
		{
			displayName: 'Update Fields',
			name: 'updateFields',
			type: 'collection',
			placeholder: 'Add field',
			default: {},
			displayOptions: showFor(['update']),
			options: [
				{
					displayName: 'Name',
					name: 'name',
					type: 'string',
					default: '',
					description: `New name for the ${singular}`,
				},
				...extras,
				...matchingFields,
			],
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
					description: `Only ${descriptor.pluralDisplayName} whose name contains this text`,
				},
			],
		},
	];
}

function isRequired(descriptor: TaxonomyDescriptor, property: INodeProperties): boolean {
	return descriptor.extraFields.some((field) => field.name === property.name && field.required);
}
