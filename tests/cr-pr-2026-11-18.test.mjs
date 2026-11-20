// CR-PR 2026-11-18: registration date (CR-1), classes (CR-2), class on student (CR-3/4), placement (CR-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';

const today = () => new Date().toISOString().slice(0, 10);
const base = { fullName: 'Ali', ic: '150101-14-1234', classId: 'cls_a', placement: 'boarding' };

test('CR-2: School Admin creates, lists, renames, deactivates and deletes classes', async () => {
  const t = await setup();
  const c1 = await t.call('adminA', 'POST', '/classes', { name: 'Tahun 2', description: 'Kelas pagi' });
  assert.equal(c1.status, 201, JSON.stringify(c1.data));
  assert.equal((await t.call('adminA', 'POST', '/classes', { name: ' tahun 2 ' })).data.code, 'class_exists');
  assert.equal((await t.call('adminA', 'POST', '/classes', { name: '' })).status, 400);
  // Same name at another school is fine; other schools' classes are invisible.
  assert.equal((await t.call('adminB', 'POST', '/classes', { name: 'Tahun 2' })).status, 201);
  const list = await t.call('adminA', 'GET', '/classes');
  assert.deepEqual(list.data.classes.map((c) => c.name).sort(), ['Tahun 1', 'Tahun 2']);
  assert.equal((await t.call('adminB', 'PATCH', `/classes/${c1.data.id}`, { name: 'X' })).status, 404);
  assert.equal((await t.call('adminA', 'PATCH', `/classes/${c1.data.id}`, { name: 'Tahun 1' })).data.code, 'class_exists');
  assert.equal((await t.call('adminA', 'PATCH', `/classes/${c1.data.id}`, { name: 'Tahun 2A', status: 'inactive' })).status, 200);
  const row = t.one('SELECT name, status FROM classes WHERE id = ?', c1.data.id);
  assert.deepEqual({ ...row }, { name: 'Tahun 2A', status: 'inactive' });
  // An inactive class cannot be given to a student.
  const s = await t.call('adminA', 'POST', '/students', { ...base, classId: c1.data.id });
  assert.equal(s.data.code, 'class_invalid');
  assert.equal((await t.call('adminA', 'DELETE', `/classes/${c1.data.id}`)).status, 200);
  // Create is no longer audited (CR-PR 2026-11-20 CR-5); update and delete are.
  assert.equal(t.one("SELECT COUNT(*) AS n FROM audit_logs WHERE entity = 'class'").n, 2);
});

test('CR-2: a class with students cannot be deleted; only School Admin manages classes', async () => {
  const t = await setup();
  await t.call('adminA', 'POST', '/students', base);
  const del = await t.call('adminA', 'DELETE', '/classes/cls_a');
  assert.equal(del.status, 409);
  assert.equal(del.data.code, 'class_in_use');
  t.sql("INSERT INTO users (id, email, full_name, password_hash, status, created_at) VALUES ('usr_bur','b@test','B','x','active','x')");
  t.sql("INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES ('url_bur','usr_bur','sch_a','bursar','x','active')");
  const bursar = { id: 'usr_bur', school: 'sch_a' };
  assert.equal((await t.call(bursar, 'GET', '/classes')).status, 200);
  assert.equal((await t.call(bursar, 'POST', '/classes', { name: 'Y' })).status, 403);
});

test('CR-1/3/5: add student requires class and placement; registration date defaults to today, not in the future', async () => {
  const t = await setup();
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, classId: '' })).data.code, 'class_required');
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, classId: 'cls_b' })).data.code, 'class_invalid');
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, placement: '' })).data.code, 'placement_required');
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, placement: 'hostel' })).data.code, 'placement_invalid');
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, registrationDate: '2999-01-01' })).data.code, 'registration_date_future');
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, registrationDate: '01/02/2026' })).data.code, 'registration_date_invalid');
  const a = await t.call('adminA', 'POST', '/students', base);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const b = await t.call('adminA', 'POST', '/students', { ...base, fullName: 'Abu', ic: 'BC7654321', registrationDate: '2026-01-15', placement: 'temp_boarding' });
  const rowA = t.one('SELECT registration_date, class_id, placement FROM students WHERE id = ?', a.data.id);
  assert.deepEqual({ ...rowA }, { registration_date: today(), class_id: 'cls_a', placement: 'boarding' });
  const detail = await t.call('adminA', 'GET', `/students/${b.data.id}`);
  assert.equal(detail.data.student.class_name, 'Tahun 1');
  assert.equal(detail.data.student.registration_date, '2026-01-15');
  assert.equal(detail.data.student.placement, 'temp_boarding');
  // List filters by class and placement.
  const byPlacement = await t.call('adminA', 'GET', '/students?placement=boarding');
  assert.deepEqual(byPlacement.data.students.map((s) => s.full_name), ['Ali']);
  assert.equal((await t.call('adminA', 'GET', '/students?classId=cls_a')).data.students.length, 2);
});

test('CR-4: changing the class is audited with before/after class names; class cannot be cleared', async () => {
  const t = await setup();
  const s = await t.call('adminA', 'POST', '/students', base);
  const c2 = await t.call('adminA', 'POST', '/classes', { name: 'Tahun 2' });
  const r = await t.call('adminA', 'PATCH', `/students/${s.data.id}`, { classId: c2.data.id, placement: 'day', registrationDate: '2026-02-01' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const log = t.one("SELECT before_json, after_json FROM audit_logs WHERE entity = 'student' AND action = 'update'");
  const before = JSON.parse(log.before_json);
  const after = JSON.parse(log.after_json);
  assert.equal(before.class_name, 'Tahun 1');
  assert.equal(after.class_name, 'Tahun 2');
  assert.equal(before.placement, 'boarding');
  assert.equal(after.placement, 'day');
  assert.equal(after.registration_date, '2026-02-01');
  assert.equal((await t.call('adminA', 'PATCH', `/students/${s.data.id}`, { classId: '' })).data.code, 'class_required');
  assert.equal((await t.call('adminA', 'PATCH', `/students/${s.data.id}`, { classId: 'cls_b' })).data.code, 'class_invalid');
});

test('registration of an accepted applicant requires class and placement and stores them', async () => {
  const t = await setup();
  const form = { studentIc: 'S00000001', parentEmail: 'p@test.my', parentPhone: '0171234567', parentIc: '800101-14-5566' };
  const appId = t.acceptedApplication('sch_a');
  const missing = await t.call('adminA', 'POST', `/applications/${appId}/register`, form);
  assert.equal(missing.data.code, 'class_required');
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 0);
  const ok = await t.call('adminA', 'POST', `/applications/${appId}/register`, { ...form, classId: 'cls_a', placement: 'day' });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const row = t.one('SELECT registration_date, class_id, placement FROM students WHERE id = ?', ok.data.studentId);
  assert.deepEqual({ ...row }, { registration_date: today(), class_id: 'cls_a', placement: 'day' });
});

test('student import needs an active class by name and a placement (key or BM/EN label)', async () => {
  const t = await setup();
  const dry = await t.call('adminA', 'POST', '/imports', {
    type: 'students',
    rows: [
      { full_name: 'A', ic: 'BC0000001', class: 'TAHUN 1', placement: 'Asrama Sementara', registration_date: '2026-03-01' },
      { full_name: 'B', ic: 'BC0000002', class: 'Tahun 9', placement: 'day' },
      { full_name: 'C', ic: 'BC0000003', class: 'Tahun 1' },
      { full_name: 'D', ic: 'BC0000004', class: 'Tahun 1', placement: 'Boarding' },
    ],
  });
  const rows = dry.data.report.rows;
  assert.equal(rows[0].errors.length, 0, rows[0].errors.join());
  assert.ok(rows[1].errors.length);
  assert.ok(rows[2].errors.length);
  assert.equal(rows[3].errors.length, 0);
  const confirm = await t.call('adminA', 'POST', `/imports/${dry.data.batch.id}/confirm`, {});
  assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
  const a = t.one("SELECT registration_date, class_id, placement FROM students WHERE full_name = 'A'");
  assert.deepEqual({ ...a }, { registration_date: '2026-03-01', class_id: 'cls_a', placement: 'temp_boarding' });
  assert.equal(t.one("SELECT registration_date FROM students WHERE full_name = 'D'").registration_date, today());
});

test('parent portal shows class and placement', async () => {
  const t = await setup();
  const appId = t.acceptedApplication('sch_a');
  const reg = await t.call('adminA', 'POST', `/applications/${appId}/register`, {
    studentIc: 'S00000002', parentEmail: 'q@test.my', parentPhone: '0171234568', parentIc: '800101-14-5567', classId: 'cls_a', placement: 'boarding',
  });
  const user = t.one('SELECT id FROM users WHERE parent_id = ?', reg.data.parentId);
  const parent = t.asUser(user.id, 'sch_a');
  const cards = await t.call(parent, 'GET', '/portal/children');
  assert.equal(cards.data.children[0].class_name, 'Tahun 1');
  assert.equal(cards.data.children[0].placement, 'boarding');
  const child = await t.call(parent, 'GET', `/portal/children/${reg.data.studentId}`);
  assert.equal(child.data.student.class_name, 'Tahun 1');
});
