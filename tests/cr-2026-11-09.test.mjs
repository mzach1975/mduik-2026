// Change request 2026-11-09: school-level fees, no class, IC / Passport No.,
// student/parent/teacher forms, IC logins and import duplicate flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { generateMonthlyInvoices } from '../worker/src/lib/finance.js';
import { hashPassword } from '../worker/src/lib/auth.js';

const PARENT_IC = '800101-14-5566';
const TEACHER_IC = 'A12345678'; // passport

function student(t, id, school = 'sch_a', ic = null) {
  t.sql(
    "INSERT INTO students (id, school_id, full_name, ic_hash, monthly_tracking, status, created_at) VALUES (?,?,?,?,1,'active','2026-01-01')",
    id,
    school,
    `Pelajar ${id}`,
    ic,
  );
  return id;
}

async function addParent(t, who, studentId, over = {}) {
  return t.call(who, 'POST', '/parents', {
    studentId,
    fullName: 'Aminah',
    ic: PARENT_IC,
    email: 'aminah@test.my',
    phone: '012-3456789',
    ...over,
  });
}

async function signIn(t, identifier, password) {
  return t.raw('POST', '/auth/login', { identifier, password });
}

test('1. a school needs both fees, and a fee change applies only to later invoices', async () => {
  const t = await setup();
  const base = { name: 'Sekolah C', category: 'tahfiz', adminEmail: 'c@test.my', adminName: 'Admin C' };
  const missing = await t.call('super', 'POST', '/schools', { ...base, monthlyFeeCents: 12000 });
  assert.equal(missing.status, 400);
  assert.equal(missing.data.code, 'fees_required');
  const ok = await t.call('super', 'POST', '/schools', { ...base, monthlyFeeCents: 12000, registrationFeeCents: 25050 });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.school.registration_fee_cents, 25050);

  student(t, 'st1');
  await generateMonthlyInvoices(t.env, 'sch_a', '2026-02');
  // School Admin edits the default monthly fee (audited with before and after).
  const edit = await t.call('adminA', 'PATCH', '/schools/sch_a', { monthly_fee_cents: 13500 });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  const log = t.one("SELECT before_json, after_json FROM audit_logs WHERE entity = 'school' AND action = 'update' AND entity_id = 'sch_a'");
  assert.equal(JSON.parse(log.before_json).monthly_fee_cents, 10000);
  assert.equal(JSON.parse(log.after_json).monthly_fee_cents, 13500);
  assert.equal((await t.call('adminA', 'PATCH', '/schools/sch_a', { registration_fee_cents: '' })).status, 400);
  await generateMonthlyInvoices(t.env, 'sch_a', '2026-03');
  const amounts = t.many("SELECT period, amount_cents FROM invoices WHERE student_id = 'st1' ORDER BY period");
  assert.deepEqual(amounts.map((a) => [a.period, a.amount_cents]), [['2026-02', 10000], ['2026-03', 13500]]);
});

test('2. a monthly invoice uses the approved adjusted rate, else the school default', async () => {
  const t = await setup();
  student(t, 'st1');
  student(t, 'st2');
  const req = await t.call('adminA', 'POST', '/students/st1/adjustments', { newRateCents: 0, reason: 'Anak yatim' });
  assert.equal(req.status, 201);
  // A pending request does not change the rate.
  await generateMonthlyInvoices(t.env, 'sch_a', '2026-02');
  assert.equal(t.one("SELECT amount_cents FROM invoices WHERE student_id = 'st1' AND period = '2026-02'").amount_cents, 10000);
  assert.equal((await t.call('adminA', 'POST', `/adjustments/${req.data.id}/approve`)).status, 200);
  await generateMonthlyInvoices(t.env, 'sch_a', '2026-03');
  assert.equal(t.one("SELECT amount_cents FROM invoices WHERE student_id = 'st1' AND period = '2026-03'").amount_cents, 0);
  assert.equal(t.one("SELECT amount_cents FROM invoices WHERE student_id = 'st2' AND period = '2026-03'").amount_cents, 10000);
});

test('3. no fee plan, class, student phone or student email in schema, API or templates', async () => {
  const t = await setup();
  const cols = t.many('PRAGMA table_info(students)').map((c) => c.name);
  for (const c of ['class_name', 'phone', 'email', 'fee_plan_id']) assert.ok(!cols.includes(c), c);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'fee_plans'").n, 0);
  const s = await t.call('adminA', 'POST', '/students', { fullName: 'Ali', ic: '150101-14-1234' });
  const detail = await t.call('adminA', 'GET', `/students/${s.data.id}`);
  for (const k of ['class_name', 'phone', 'email', 'fee_plan_id', 'ic_hash', 'ic_enc']) assert.ok(!(k in detail.data.student), k);
  assert.equal(detail.data.student.monthly_fee_cents, 10000);
  const settings = await t.call('adminA', 'GET', '/school-settings');
  assert.equal(settings.data.feePlans, undefined);
  assert.equal((await t.call('adminA', 'GET', '/students/classes')).status, 404);
  assert.equal((await t.call('adminA', 'POST', '/school-settings/fee-plans', { name: 'X' })).status, 404);
  const lookups = await t.call('adminA', 'GET', '/lookups');
  assert.equal(lookups.data.classes, undefined);
  assert.equal(lookups.data.feePlans, undefined);
  const reports = await t.call('adminA', 'GET', '/reports/student-records');
  assert.ok(!JSON.stringify(reports.data).toLowerCase().includes('class'));
  const { default: worker } = await import('../worker/src/index.js');
  const { signToken, SESSION_COOKIE } = await import('../worker/src/lib/auth.js');
  const cookie = `${SESSION_COOKIE}=${await signToken(t.env, { sub: 'usr_adminA', sch: 'sch_a' })}`;
  for (const type of ['students', 'parents', 'teachers']) {
    const res = await worker.fetch(new Request(`http://test/api/imports/templates/${type}`, { headers: { cookie } }), t.env, { waitUntil() {} });
    assert.equal(res.status, 200);
    const header = (await res.text()).replace(/^﻿/, '').trim().split(',');
    assert.ok(header.includes('ic'), type);
    assert.ok(!header.some((h) => /class|fee_plan|monthly_fee/.test(h)), `${type}: ${header}`);
    if (type === 'students') assert.ok(!header.includes('phone') && !header.includes('email'), header.join());
  }
  assert.equal((await t.call('adminA', 'GET', '/imports/templates/classes')).status, 404);
});

test('4. add student: IC / Passport No. is mandatory and accepts birth certificate and MyKid numbers', async () => {
  const t = await setup();
  const noIc = await t.call('adminA', 'POST', '/students', { fullName: 'Ali' });
  assert.equal(noIc.status, 400);
  assert.equal(noIc.data.code, 'ic_required');
  const birthCert = await t.call('adminA', 'POST', '/students', { fullName: 'Ali', ic: 'bc 123-4567' });
  assert.equal(birthCert.status, 201, JSON.stringify(birthCert.data));
  const myKid = await t.call('adminA', 'POST', '/students', {
    fullName: 'Abu',
    ic: '150101-14-1234',
    // A parent section sent by an old client is ignored.
    parentName: 'X',
    parentIc: PARENT_IC,
    parentEmail: 'x@test.my',
  });
  assert.equal(myKid.status, 201);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 0);
  const row = t.one('SELECT ic_masked FROM students WHERE id = ?', myKid.data.id);
  assert.equal(row.ic_masked, '********1234');
  // Same IC again: a warning that the admin confirms.
  const dup = await t.call('adminA', 'POST', '/students', { fullName: 'Ali 2', ic: 'BC1234567' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'student_ic_exists');
  assert.equal((await t.call('adminA', 'POST', '/students', { fullName: 'Ali 2', ic: 'BC1234567', allowDuplicateIc: true })).status, 201);
});

test('5. the student page lists parents (masked IC, phone, email) read only', async () => {
  const t = await setup();
  const s = await t.call('adminA', 'POST', '/students', { fullName: 'Ali', ic: '150101-14-1234' });
  await addParent(t, 'adminA', s.data.id);
  const detail = await t.call('adminA', 'GET', `/students/${s.data.id}`);
  assert.equal(detail.data.parents.length, 1);
  const p = detail.data.parents[0];
  assert.deepEqual(Object.keys(p).sort(), ['email', 'full_name', 'ic_masked', 'id', 'phone', 'relationship', 'status']);
  assert.equal(p.ic_masked, '********5566');
});

test('6. add parent needs IC, email and phone; the login ID and first password are the IC', async () => {
  const t = await setup();
  const s = student(t, 'st1');
  for (const [field, code] of [['ic', 'ic_required'], ['email', 'email_required'], ['phone', 'phone_required']]) {
    const res = await addParent(t, 'adminA', s, { [field]: '' });
    assert.equal(res.status, 400, field);
    assert.equal(res.data.code, code);
  }
  const res = await addParent(t, 'adminA', s);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.data.loginCreated, true);
  const user = t.one('SELECT * FROM users WHERE id = ?', res.data.userId);
  assert.equal(user.must_change_password, 1);
  assert.ok(!JSON.stringify(user).includes('800101145566'));
  const login = await signIn(t, '800101145566', '800101-14-5566');
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal((await signIn(t, 'aminah@test.my', '800101145566')).status, 200);
  assert.equal((await signIn(t, '800101145566', 'wrong-password')).status, 401);
  // The welcome email gives the login ID with a masked IC and never the password.
  const mail = t.one("SELECT body FROM notifications WHERE type = 'account_created' AND user_id = ?", res.data.userId).body;
  assert.ok(mail.includes('aminah@test.my') && mail.includes('********5566'));
  assert.ok(!mail.includes('800101145566') && !mail.includes('800101-14-5566'));
});

test('7. first login forces a password change, and the IC is rejected as the new password', async () => {
  const t = await setup();
  const s = student(t, 'st1');
  await addParent(t, 'adminA', s);
  const { cookie } = await signIn(t, PARENT_IC, '800101145566');
  const blocked = await t.raw('GET', '/portal/children', undefined, cookie);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'password_change_required');
  const same = await t.raw('POST', '/auth/change-password', { currentPassword: '800101145566', newPassword: '800101-14-5566' }, cookie);
  assert.equal(same.status, 400);
  assert.equal(same.data.code, 'password_rule');
  const changed = await t.raw('POST', '/auth/change-password', { currentPassword: '800101145566', newPassword: 'Selamat#2026' }, cookie);
  assert.equal(changed.status, 200);
  const open = await t.raw('GET', '/portal/children', undefined, changed.cookie);
  assert.equal(open.status, 200, JSON.stringify(open.data));
  assert.equal((await signIn(t, PARENT_IC, '800101145566')).status, 401);
  const again = await signIn(t, PARENT_IC, 'Selamat#2026');
  assert.equal(again.data.user.mustChangePassword, false);
});

test('8. add teacher always creates a login (no checkbox or password) and needs all four fields', async () => {
  const t = await setup();
  const base = { fullName: 'Cikgu Ali', ic: TEACHER_IC, email: 'ali@test.my', phone: '0111111111' };
  const noPhone = await t.call('adminA', 'POST', '/teachers', { ...base, phone: '' });
  assert.equal(noPhone.status, 400);
  const res = await t.call('adminA', 'POST', '/teachers', { ...base, createLogin: false, password: 'ignored1' });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const user = t.one('SELECT * FROM users WHERE id = ?', res.data.userId);
  assert.ok(user);
  assert.equal(user.must_change_password, 1);
  assert.equal((await signIn(t, 'a12345678', 'A12345678')).status, 200);
  assert.ok(t.one("SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND school_id = 'sch_a' AND role = 'teacher'", res.data.userId));
});

test('9. IC search finds the existing parent or teacher; a teacher at two schools has one record and two memberships', async () => {
  const t = await setup();
  const base = { fullName: 'Cikgu Ali', ic: TEACHER_IC, email: 'ali@test.my', phone: '0111111111' };
  const a = await t.call('adminA', 'POST', '/teachers', base);
  const lookup = await t.call('adminB', 'GET', `/teachers/lookup?ic=${TEACHER_IC.toLowerCase()}`);
  assert.equal(lookup.data.match.id, a.data.id);
  assert.equal(lookup.data.match.ic_hash, undefined);
  assert.equal(lookup.data.match.memberHere, false);
  const b = await t.call('adminB', 'POST', '/teachers', { teacherId: lookup.data.match.id, ic: TEACHER_IC });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.equal(b.data.linked, true);
  // Typing the IC again without choosing still never duplicates.
  assert.equal((await t.call('adminB', 'POST', '/teachers', { ...base, fullName: 'Other' })).data.code, 'already_member');
  assert.equal(t.one('SELECT COUNT(*) AS n FROM teachers').n, 1);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM teacher_schools').n, 2);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM users WHERE email = 'ali@test.my'").n, 1);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM user_roles WHERE role = 'teacher'").n, 2);
  const listB = await t.call('adminB', 'GET', '/teachers');
  assert.equal(listB.data.teachers.length, 1);

  const s = student(t, 'st1');
  await addParent(t, 'adminA', s);
  const pl = await t.call('adminA', 'GET', `/parents/lookup?ic=${encodeURIComponent('800101 14 5566')}`);
  assert.ok(pl.data.match);
  const again = await addParent(t, 'adminA', s, { fullName: 'Another name' });
  assert.equal(again.data.linked, true);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 1);
});

test('10. an email or phone used by another parent or teacher shows a warning', async () => {
  const t = await setup();
  await t.call('adminA', 'POST', '/teachers', { fullName: 'Cikgu Ali', ic: TEACHER_IC, email: 'ali@test.my', phone: '0111111111' });
  const s = student(t, 'st1');
  const parent = await addParent(t, 'adminA', s, { email: 'other@test.my', phone: '+60 11-1111 111' });
  assert.equal(parent.status, 409);
  assert.equal(parent.data.code, 'duplicate_contact');
  assert.equal(parent.data.matches[0].kind, 'teacher');
  assert.deepEqual(parent.data.matches[0].matchedOn, ['phone']);
  const anyway = await addParent(t, 'adminA', s, { email: 'other@test.my', phone: '0111111111', createAnyway: true, duplicateReason: 'Family phone' });
  assert.equal(anyway.status, 201);
  const teacher = await t.call('adminA', 'POST', '/teachers', { fullName: 'T2', ic: '900909-09-9090', email: 'OTHER@test.my', phone: '0122222222' });
  assert.equal(teacher.status, 409);
  assert.equal(teacher.data.matches[0].kind, 'parent');
});

test('11. link child and remove link only for students of the admin’s own school', async () => {
  const t = await setup();
  const sa = student(t, 'stA');
  const sb = student(t, 'stB', 'sch_b');
  const sa2 = student(t, 'stA2');
  const p = await addParent(t, 'adminA', sa);
  const pid = p.data.id;
  assert.equal((await t.call('adminA', 'POST', `/parents/${pid}/link`, { studentId: sb })).status, 404);
  const ok = await t.call('adminA', 'POST', `/parents/${pid}/link`, { studentId: sa2 });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await t.call('adminA', 'POST', `/parents/${pid}/link`, { studentId: sa2 })).status, 409);
  // School B links its own student to the same parent (found by IC).
  const linkB = await t.call('adminB', 'POST', `/parents/${pid}/link`, { studentId: sb, parentIc: PARENT_IC });
  assert.equal(linkB.status, 200, JSON.stringify(linkB.data));
  assert.equal(t.one('SELECT school_id FROM parent_students WHERE student_id = ?', sb).school_id, 'sch_b');
  assert.equal((await t.call('adminA', 'DELETE', `/parents/${pid}/links/${sb}`, { confirmLastLink: true })).status, 403);
  // The parent page (seen by school A) shows only school A's children.
  const page = await t.call('adminA', 'GET', `/parents/${pid}`);
  assert.deepEqual(page.data.children.map((c) => c.id).sort(), ['stA', 'stA2']);
});

test('12. removing a link keeps the parent and the student, warns on the last link, and is audited', async () => {
  const t = await setup();
  const sa = student(t, 'stA');
  const p = await addParent(t, 'adminA', sa);
  const last = await t.call('adminA', 'DELETE', `/parents/${p.data.id}/links/${sa}`, {});
  assert.equal(last.status, 409);
  assert.equal(last.data.code, 'last_link');
  const ok = await t.call('adminA', 'DELETE', `/parents/${p.data.id}/links/${sa}`, { confirmLastLink: true });
  assert.equal(ok.status, 200);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parent_students').n, 0);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 1);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM students').n, 1);
  assert.ok(t.one('SELECT user_id FROM parents').user_id);
  const log = t.one("SELECT * FROM audit_logs WHERE action = 'unlink'");
  assert.equal(JSON.parse(log.before_json).studentId, sa);
});

test('17. Super Admin and School Admin sign in with email and a set password, with no forced change', async () => {
  const t = await setup();
  t.sql("UPDATE users SET email = 'admina@test.my', password_hash = ? WHERE id = ?", await hashPassword('Admin#2026'), 'usr_adminA');
  const login = await signIn(t, 'admina@test.my', 'Admin#2026');
  assert.equal(login.status, 200);
  assert.equal(login.data.user.mustChangePassword, false);
  assert.equal((await t.raw('GET', '/students', undefined, login.cookie)).status, 200);
  // A teacher login created for an admin's email reuses the admin login without the IC rule.
  const teacher = await t.call('adminA', 'POST', '/teachers', { fullName: 'adminA', ic: '700101-01-0101', email: 'ADMINA@test.my', phone: '0133333333' });
  assert.equal(teacher.status, 201, JSON.stringify(teacher.data));
  const admin = t.one("SELECT ic_hash, must_change_password FROM users WHERE id = 'usr_adminA'");
  assert.equal(admin.ic_hash, null);
  assert.equal(admin.must_change_password, 0);
});

test('18. the import dry run flags duplicates by IC / Passport No., email and phone', async () => {
  const t = await setup();
  await t.call('adminA', 'POST', '/teachers', { fullName: 'Cikgu Ali', ic: TEACHER_IC, email: 'ali@test.my', phone: '0111111111' });
  const s = student(t, 'st1');
  await addParent(t, 'adminA', s);
  const parents = await t.call('adminA', 'POST', '/imports', {
    type: 'parents',
    rows: [
      { full_name: 'By IC', ic: '800101145566', email: 'new1@test.my', phone: '0150000001' },
      { full_name: 'By email', ic: '600606-06-0606', email: 'aminah@test.my', phone: '0150000002' },
      { full_name: 'By phone', ic: '600606-06-0607', email: 'new3@test.my', phone: '011-111 1111' },
      { full_name: 'New', ic: '600606-06-0608', email: 'new4@test.my', phone: '0150000004' },
      { full_name: 'No IC', email: 'new5@test.my', phone: '0150000005' },
    ],
  });
  assert.equal(parents.status, 201);
  const rows = parents.data.report.rows;
  assert.deepEqual(rows[0].duplicates[0].matchedOn, ['ic']);
  assert.deepEqual(rows[1].duplicates[0].matchedOn, ['email']);
  assert.deepEqual(rows[2].duplicates.map((d) => [d.kind, d.matchedOn[0]]), [['teacher', 'phone']]);
  assert.equal(rows[3].duplicates.length, 0);
  assert.ok(rows[4].errors.length);
  assert.equal(parents.data.batch.duplicates, 3);
  // No row is created silently: the admin must choose.
  assert.equal((await t.call('adminA', 'POST', `/imports/${parents.data.batch.id}/confirm`, {})).status, 409);
  const confirm = await t.call('adminA', 'POST', `/imports/${parents.data.batch.id}/confirm`, { duplicateAction: 'link' });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
  // IC and email rows reuse Aminah; the phone row matched only a teacher, so it is skipped; "New" is created.
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 2);
  assert.equal(confirm.data.skipped, 1);

  const teachers = await t.call('adminA', 'POST', '/imports', {
    type: 'teachers',
    rows: [{ full_name: 'Ali again', ic: 'a12345678', email: 'x@test.my', phone: '0160000000' }],
  });
  assert.deepEqual(teachers.data.report.rows[0].duplicates[0].matchedOn, ['ic']);

  const students = await t.call('adminA', 'POST', '/imports', {
    type: 'students',
    rows: [{ full_name: 'Kid', ic: '150101-14-1234' }, { full_name: 'No IC' }],
  });
  assert.equal(students.data.report.rows[0].errors.length, 0);
  assert.ok(students.data.report.rows[1].errors.length);
});

test('migration: existing data is backed up, class/fee plan columns dropped, rates and memberships kept', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync } = await import('node:fs');
  const { ensureSchema } = await import('../worker/src/lib/migrate.js');
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  raw.exec(`INSERT INTO schools (id, name, category, monthly_fee_cents, created_at) VALUES ('s1','S1','tahfiz',15000,'x');
    INSERT INTO fee_plans (id, school_id, name, monthly_fee_cents, registration_fee_cents, created_at) VALUES ('fp1','s1','Diskaun',9000,20000,'x');
    INSERT INTO students (id, school_id, full_name, class_name, phone, email, fee_plan_id, monthly_fee_cents, ic_masked, created_at)
      VALUES ('st1','s1','Kid','1A','012','kid@x','fp1',9000,'******-**-1234','x'),
             ('st2','s1','Kid2','1B','','',NULL,15000,NULL,'x');
    INSERT INTO teachers (id, school_id, full_name, phone, status, created_at) VALUES ('t1','s1','Cikgu','012-345 6789','active','x');`);
  const t = await setup();
  const wrap = () => Object.assign(Object.create(Object.getPrototypeOf(t.DB)), { db: raw });
  await ensureSchema({ DB: wrap() });
  await ensureSchema({ DB: wrap() }); // repeatable
  const cols = raw.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
  assert.ok(!cols.includes('class_name') && !cols.includes('fee_plan_id') && !cols.includes('phone'));
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'fee_plans'").get().n, 0);
  const backup = JSON.parse(raw.prepare("SELECT data_json FROM migration_backups WHERE row_id = 'st1' AND table_name = 'students'").get().data_json);
  assert.equal(backup.class_name, '1A');
  assert.equal(backup.fee_plan_id, 'fp1');
  assert.ok(raw.prepare("SELECT 1 AS ok FROM migration_backups WHERE table_name = 'fee_plans' AND row_id = 'fp1'").get());
  // The fee plan rate is kept as an approved adjustment; the default-rate student gets none.
  assert.equal(raw.prepare("SELECT new_rate_cents FROM fee_adjustments WHERE student_id = 'st1' AND status = 'approved'").get().new_rate_cents, 9000);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM fee_adjustments WHERE student_id = 'st2'").get().n, 0);
  assert.equal(raw.prepare("SELECT ic_masked FROM students WHERE id = 'st1'").get().ic_masked, '********1234');
  assert.equal(raw.prepare("SELECT school_id FROM teacher_schools WHERE teacher_id = 't1'").get().school_id, 's1');
  assert.equal(raw.prepare("SELECT phone_norm FROM teachers WHERE id = 't1'").get().phone_norm, '0123456789');
});
