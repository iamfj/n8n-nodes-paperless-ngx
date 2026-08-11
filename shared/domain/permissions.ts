export type PermissionSet = { users: number[]; groups: number[] };

/** The permission block Paperless returns on an owned object when `full_perms` is set. */
export type Permissions = { view: PermissionSet; change: PermissionSet };

export type PermissionsPatch = { view?: Partial<PermissionSet>; change?: Partial<PermissionSet> };

// `set_permissions_for_object` iterates only the arms and sub-keys present in the
// payload, and the serializer deletes an omitted action outright, so an arm left
// out means "leave unchanged". Writing an empty arm is therefore not a harmless
// default -- with `merge=False` it revokes that permission from everyone.
function supplied(set: Partial<PermissionSet>): Partial<PermissionSet> {
	const result: Partial<PermissionSet> = {};
	if (set.users) {
		result.users = [...set.users];
	}
	if (set.groups) {
		result.groups = [...set.groups];
	}
	return result;
}

export function toSetPermissions(patch: PermissionsPatch): { set_permissions: PermissionsPatch } {
	const set_permissions: PermissionsPatch = {};
	if (patch.view) {
		set_permissions.view = supplied(patch.view);
	}
	if (patch.change) {
		set_permissions.change = supplied(patch.change);
	}
	return { set_permissions };
}

/**
 * n8n has no "list of numbers" property type, so user and group IDs reach us as
 * a comma-separated string. An empty string yields `undefined` rather than `[]`,
 * because an empty arm is a revocation — see the note on `supplied()` above.
 */
export function parseIdList(raw: unknown): number[] | undefined {
	if (typeof raw !== 'string') {
		return undefined;
	}
	const ids = raw
		.split(',')
		.map((entry) => Number.parseInt(entry.trim(), 10))
		.filter((id) => Number.isInteger(id));
	return ids.length > 0 ? ids : undefined;
}

/**
 * Turns the node's four flat permission fields into the nested patch, dropping
 * arms the user left blank so they stay unchanged.
 */
export function toPermissionsPatch(fields: {
	viewUsers?: unknown;
	viewGroups?: unknown;
	changeUsers?: unknown;
	changeGroups?: unknown;
}): PermissionsPatch | undefined {
	const view: Partial<PermissionSet> = {};
	const change: Partial<PermissionSet> = {};
	const viewUsers = parseIdList(fields.viewUsers);
	const viewGroups = parseIdList(fields.viewGroups);
	const changeUsers = parseIdList(fields.changeUsers);
	const changeGroups = parseIdList(fields.changeGroups);

	if (viewUsers) {
		view.users = viewUsers;
	}
	if (viewGroups) {
		view.groups = viewGroups;
	}
	if (changeUsers) {
		change.users = changeUsers;
	}
	if (changeGroups) {
		change.groups = changeGroups;
	}

	const patch: PermissionsPatch = {};
	if (Object.keys(view).length > 0) {
		patch.view = view;
	}
	if (Object.keys(change).length > 0) {
		patch.change = change;
	}
	return Object.keys(patch).length > 0 ? patch : undefined;
}

/** Paperless omits the `permissions` block unless `full_perms` is requested. */
export function fullPermsQuery(include: boolean): { full_perms?: 'true' } {
	return include ? { full_perms: 'true' } : {};
}
