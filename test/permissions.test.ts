import {
	EMPTY_PERMISSION_SET,
	fullPermsQuery,
	toSetPermissions,
} from '../shared/domain/permissions';

describe('permissions', () => {
	it('fills the arm the caller omitted, since Paperless replaces the whole block', () => {
		expect(toSetPermissions({ view: { users: [1, 2] } })).toEqual({
			set_permissions: {
				view: { users: [1, 2], groups: [] },
				change: { users: [], groups: [] },
			},
		});
	});

	it('fills the missing half of a partially given arm', () => {
		expect(toSetPermissions({ change: { groups: [7] } }).set_permissions.change).toEqual({
			users: [],
			groups: [7],
		});
	});

	it('carries both arms through untouched', () => {
		const patch = { view: { users: [1], groups: [2] }, change: { users: [3], groups: [4] } };
		expect(toSetPermissions(patch).set_permissions).toEqual(patch);
	});

	it('never hands out a shared mutable empty set', () => {
		const first = toSetPermissions({}).set_permissions.view.users;
		first.push(99);
		expect(toSetPermissions({}).set_permissions.view.users).toEqual([]);
		expect(EMPTY_PERMISSION_SET).toEqual({ users: [], groups: [] });
		expect(Object.isFrozen(EMPTY_PERMISSION_SET)).toBe(true);
	});

	it('requests full permissions only when asked', () => {
		expect(fullPermsQuery(true)).toEqual({ full_perms: 'true' });
		expect(fullPermsQuery(false)).toEqual({});
	});
});
