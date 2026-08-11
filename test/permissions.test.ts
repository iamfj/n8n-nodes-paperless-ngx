import { fullPermsQuery, toSetPermissions } from '../shared/domain/permissions';

describe('permissions', () => {
	it('omits the arm the caller omitted, since an omitted arm means unchanged', () => {
		expect(toSetPermissions({ view: { users: [1, 2] } })).toEqual({
			set_permissions: { view: { users: [1, 2] } },
		});
	});

	it('never writes an empty arm, which would revoke that permission from everyone', () => {
		const payload = toSetPermissions({ view: { users: [5] } }).set_permissions;
		expect('change' in payload).toBe(false);
		expect(JSON.stringify(payload)).not.toContain('change');
	});

	it('sends only the sub-key that was given, leaving the other one untouched', () => {
		expect(toSetPermissions({ change: { groups: [7] } }).set_permissions).toEqual({
			change: { groups: [7] },
		});
	});

	it('sends nothing at all for an empty patch', () => {
		expect(toSetPermissions({})).toEqual({ set_permissions: {} });
	});

	it('carries both arms through untouched', () => {
		const patch = { view: { users: [1], groups: [2] }, change: { users: [3], groups: [4] } };
		expect(toSetPermissions(patch).set_permissions).toEqual(patch);
	});

	it('copies the arrays, so a later mutation of the patch cannot reach the payload', () => {
		const users: number[] = [1];
		const payload = toSetPermissions({ view: { users } }).set_permissions;
		users.push(99);
		expect(payload.view?.users).toEqual([1]);
	});

	it('requests full permissions only when asked', () => {
		expect(fullPermsQuery(true)).toEqual({ full_perms: 'true' });
		expect(fullPermsQuery(false)).toEqual({});
	});
});
