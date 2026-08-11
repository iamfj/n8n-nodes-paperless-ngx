export type PermissionSet = { users: number[]; groups: number[] };

export type Permissions = { view: PermissionSet; change: PermissionSet };

export type PermissionsPatch = { view?: Partial<PermissionSet>; change?: Partial<PermissionSet> };

/** The ownership block Paperless attaches to every owned object. */
export type Ownership = {
	owner: number | null;
	user_can_change?: boolean;
	permissions?: Permissions;
};

export const EMPTY_PERMISSION_SET: PermissionSet = Object.freeze({ users: [], groups: [] });

// `set_permissions` replaces the whole block: an arm left out of the payload is
// not "unchanged", it is "revoked from everyone". Every arm is therefore always
// written, so a caller patching only `view` cannot silently strip `change`.
function fill(set?: Partial<PermissionSet>): PermissionSet {
	return { users: set?.users ?? [], groups: set?.groups ?? [] };
}

export function toSetPermissions(patch: PermissionsPatch): { set_permissions: Permissions } {
	return { set_permissions: { view: fill(patch.view), change: fill(patch.change) } };
}

/** Paperless omits the `permissions` block unless `full_perms` is requested. */
export function fullPermsQuery(include: boolean): { full_perms?: 'true' } {
	return include ? { full_perms: 'true' } : {};
}
