// CR-PR 2026-11-17: Super Admin creates Super Admin users (CR-3), "madrasah" labels (CR-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';

test('CR-3: Super Admin creates another Super Admin with no madrasah', async () => {
  const t = await setup();
  const r = await t.call('super', 'POST', '/users', { role: 'super_admin', fullName: 'Super Dua', email: 'super2@test.my', password: 'Rahsia@123' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const roles = t.DB.db.prepare('SELECT school_id, role FROM user_roles WHERE user_id = ?').all(r.data.id);
  assert.deepEqual(roles.map((x) => ({ ...x })), [{ school_id: null, role: 'super_admin' }]);
  const created = { id: r.data.id, school: null };
  const list = await t.call(created, 'GET', '/schools');
  assert.equal(list.status, 200);
  assert.equal(list.data.schools.length, 2);
});

test('CR-3: a Super Admin needs a password of at least 8 characters', async () => {
  const t = await setup();
  const r = await t.call('super', 'POST', '/users', { role: 'super_admin', fullName: 'Super Dua', email: 'super2@test.my' });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'password_rule');
});

test('CR-3: a Madrasah Admin cannot create a Super Admin', async () => {
  const t = await setup();
  const r = await t.call('adminA', 'POST', '/users', { role: 'super_admin', fullName: 'X', email: 'x@test.my', password: 'Rahsia@123' });
  assert.equal(r.status, 403);
  assert.equal(t.DB.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'x@test.my'").get().n, 0);
});

test('CR-1: server messages say madrasah', async () => {
  const t = await setup();
  const r = await t.call('super', 'PATCH', '/schools/sch_x', { name: 'Y' });
  assert.equal(r.status, 404);
  assert.match(r.data.error, /Madrasah tidak dijumpai\. \/ Madrasah not found\./);
});
