// CR-PR 2026-11-14: school creation errors (PR-1), teacher IC lookup (PR-2),
// school name/category by Super Admin (CR-1), School Admin settings (CR-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { hashIc, hashPassword } from '../worker/src/lib/auth.js';

const newSchool = (over = {}) => ({
  name: 'Maahad Baru',
  category: 'tahfiz',
  monthlyFeeCents: 10000,
  registrationFeeCents: 20000,
  monthlyDueDay: 7,
  adminName: 'Admin Baru',
  adminEmail: 'baru@test.my',
  ...over,
});

test('PR-1: invalid school input returns a meaningful 4xx, never a system error', async () => {
  const t = await setup();
  for (const [over, status, pattern] of [
    [{ monthlyDueDay: 30 }, 400, /Monthly due day must be between 1 and 28/],
    [{ monthlyDueDay: 0 }, 400, /Monthly due day/],
    [{ adminEmail: 'not-an-email' }, 400, /School Admin email is invalid/],
    [{ adminPassword: 'short' }, 400, /at least 8 characters/],
    [{ email: 'bad@' }, 400, /School email is invalid/],
    [{ name: 'Sekolah A' }, 409, /already exists/],
    [{ regDueMonth: 13 }, 400, /Month must be between 1 and 12/],
  ]) {
    const r = await t.call('super', 'POST', '/schools', newSchool(over));
    assert.equal(r.status, status, JSON.stringify(over));
    assert.match(r.data.error, pattern);
  }
  const ok = await t.call('super', 'POST', '/schools', newSchool());
  assert.equal(ok.status, 201);
  assert.equal(ok.data.school.monthly_due_day, 7);
});

test('PR-1: school updates validate schedule values', async () => {
  const t = await setup();
  const r = await t.call('super', 'PATCH', '/schools/sch_a', { reg_due_day: 0 });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Day must be between 1 and 31/);
});

test('CR-1: Super Admin updates school name and category', async () => {
  const t = await setup();
  const r = await t.call('super', 'PATCH', '/schools/sch_a', { name: 'Sekolah A Baharu', category: 'islamic_studies' });
  assert.equal(r.status, 200);
  assert.equal(r.data.school.name, 'Sekolah A Baharu');
  assert.equal(r.data.school.category, 'islamic_studies');
  const clash = await t.call('super', 'PATCH', '/schools/sch_a', { name: 'sekolah b' });
  assert.equal(clash.status, 409);
  const bad = await t.call('super', 'PATCH', '/schools/sch_a', { category: 'other' });
  assert.equal(bad.status, 400);
});

test('CR-3: School Admin changes only phone, email and address of the school profile', async () => {
  const t = await setup();
  const r = await t.call('adminA', 'PATCH', '/schools/sch_a', {
    name: 'X', short_name: 'X', category: 'islamic_studies', state: 'Johor',
    phone: '03-1234', email: 'office@a.my', address: 'Jalan 1',
  });
  assert.equal(r.status, 200);
  const s = t.one('SELECT * FROM schools WHERE id = ?', 'sch_a');
  assert.equal(s.name, 'Sekolah A');
  assert.equal(s.category, 'tahfiz');
  assert.equal(s.short_name, null);
  assert.equal(s.state, null);
  assert.equal(s.phone, '03-1234');
  assert.equal(s.email, 'office@a.my');
  assert.equal(s.address, 'Jalan 1');
  const locked = await t.call('adminA', 'PATCH', '/schools/sch_a', { name: 'X', state: 'Johor' });
  assert.equal(locked.status, 400); // nothing they may change
});

test('CR-3: School Admin changes their own login email with the current password', async () => {
  const t = await setup();
  t.sql('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword('Rahsia123!'), 'usr_adminA');
  const noPw = await t.call('adminA', 'PATCH', '/auth/profile', { email: 'new.admin@a.my' });
  assert.equal(noPw.status, 400);
  assert.equal(noPw.data.code, 'password_required');
  t.sql("UPDATE users SET email = 'admin.b@b.my' WHERE id = 'usr_adminB'");
  const taken = await t.call('adminA', 'PATCH', '/auth/profile', { email: 'Admin.B@b.my', currentPassword: 'Rahsia123!' });
  assert.equal(taken.status, 409);
  const ok = await t.call('adminA', 'PATCH', '/auth/profile', { email: 'New.Admin@a.my', currentPassword: 'Rahsia123!' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, 'new.admin@a.my');
  assert.equal(t.one('SELECT email FROM users WHERE id = ?', 'usr_adminA').email, 'new.admin@a.my');
});

test('CR-3: a parent cannot change their login email on the profile', async () => {
  const t = await setup();
  t.sql("INSERT INTO users (id, email, full_name, password_hash, status, created_at) VALUES ('usr_p','p@test','P','x','active','x')");
  t.sql("INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES ('url_p','usr_p','sch_a','parent','x','active')");
  const r = await t.call({ id: 'usr_p', school: 'sch_a' }, 'PATCH', '/auth/profile', { email: 'q@test', currentPassword: 'x' });
  assert.equal(r.status, 403);
});

test('PR-2: a teacher whose IC is only on their login is found by IC and linked to another school', async () => {
  const t = await setup();
  const ic = '800101-01-1234';
  t.sql(
    "INSERT INTO users (id, email, full_name, ic_hash, password_hash, status, created_at) VALUES ('usr_g','guru@test','Ustaz Ali',?,'x','active','x')",
    await hashIc(t.env, ic),
  );
  t.sql("INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES ('url_g','usr_g','sch_b','teacher','x','active')");
  t.sql(
    "INSERT INTO teachers (id, school_id, full_name, email, phone, ic_masked, user_id, status, created_at) VALUES ('tch_g','sch_b','Ustaz Ali','guru@test','0123456789','********1234','usr_g','active','x')",
  );
  t.sql("INSERT INTO teacher_schools (id, teacher_id, school_id, status, created_at) VALUES ('tsm_g','tch_g','sch_b','active','x')");

  const look = await t.call('adminA', 'GET', `/teachers/lookup?ic=${encodeURIComponent(ic)}`);
  assert.equal(look.status, 200);
  assert.equal(look.data.match.id, 'tch_g');
  assert.equal(look.data.match.full_name, 'Ustaz Ali');
  assert.equal(look.data.match.memberHere, false);
  assert.equal(look.data.match.ic_hash, undefined);
  assert.ok(t.one("SELECT ic_hash FROM teachers WHERE id = 'tch_g'").ic_hash, 'teacher row backfilled');

  const add = await t.call('adminA', 'POST', '/teachers', { ic });
  assert.ok([200, 201].includes(add.status), JSON.stringify(add.data));
  assert.equal(t.one("SELECT COUNT(*) n FROM teachers").n, 1);
  assert.equal(t.one("SELECT status FROM teacher_schools WHERE teacher_id = 'tch_g' AND school_id = 'sch_a'").status, 'active');

  const again = await t.call('adminA', 'GET', `/teachers/lookup?ic=${encodeURIComponent(ic)}`);
  assert.equal(again.data.match.memberHere, true);
});
