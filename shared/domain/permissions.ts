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

/** Paperless omits the `permissions` block unless `full_perms` is requested. */
export function fullPermsQuery(include: boolean): { full_perms?: 'true' } {
	return include ? { full_perms: 'true' } : {};
}
