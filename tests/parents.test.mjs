import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import { createInvoice } from '../worker/src/lib/finance.js';

const IC = '800101-14-5566';

let seq = 0;
/**
 * Registers an accepted applicant at a school and returns the response. Each
 * call gets its own student IC, and a new parent gets a unique email/phone
 * unless the form gives them (they are mandatory for a new parent).
 */
async function register(t, who, schoolId, form = {}, app = {}) {
  const n = ++seq;
  const appId = t.acceptedApplication(schoolId, app);
  const defaults = { studentIc: `S${String(n).padStart(8, '0')}` };
  if (!form.parentId) {
    defaults.parentEmail = `p${n}@test.my`;
    defaults.parentPhone = `017${String(n).padStart(7, '0')}`;
  }
  return t.call(who, 'POST', `/applications/${appId}/register`, { ...defaults, ...form });
}

const parentUserOf = (t, parentId, school) => t.asUser(t.one('SELECT user_id FROM parents WHERE id = ?', parentId).user_id, school);

test('IC match links the existing parent with no duplicate record', async () => {
  const t = await setup();
  const first = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my', parentPhone: '012-3456789' });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.parentLinked, false);

  // School B searches by IC: the stored record is returned (masked IC only).
  const lookup = await t.call('adminB', 'GET', `/parents/lookup?ic=${encodeURIComponent(IC)}`);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.match.id, first.data.parentId);
  assert.equal(lookup.data.match.ic_hash, undefined);
  assert.equal(lookup.data.match.ic_enc, undefined);
  assert.match(lookup.data.match.ic_masked, /5566$/);

  // School B selects the match.
  const second = await register(t, 'adminB', 'sch_b', { parentId: lookup.data.match.id, parentIc: IC });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  assert.equal(second.data.parentId, first.data.parentId);

  // Typing the same IC without selecting still links, never duplicates.
  const third = await register(t, 'adminB', 'sch_b', { parentIc: '800101145566', parentName: 'Different Name' });
  assert.equal(third.status, 201, JSON.stringify(third.data));
  assert.equal(third.data.parentId, first.data.parentId);
  assert.equal(third.data.parentLinked, true);

  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 1);
  const links = t.many('SELECT school_id FROM parent_students WHERE parent_id = ? ORDER BY school_id', first.data.parentId);
  assert.deepEqual(links.map((l) => l.school_id), ['sch_a', 'sch_b', 'sch_b']);
  // The IC is stored only as a keyed hash and ciphertext.
  const row = t.one('SELECT * FROM parents');
  assert.ok(row.ic_hash && row.ic_enc);
  assert.ok(!JSON.stringify(row).includes('800101145566'));
});

test('IC is required for a new parent on the registration form', async () => {
  const t = await setup();
  const res = await register(t, 'adminA', 'sch_a', { parentName: 'No IC' });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'ic_required');
  assert.equal(t.one('SELECT COUNT(*) AS n FROM students').n, 0);
});

test('email or phone match triggers the duplicate warning', async () => {
  const t = await setup();
  const first = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my', parentPhone: '012-3456789' });
  assert.equal(first.status, 201);

  // New IC, same email: warning, nothing written.
  const byEmail = await register(t, 'adminB', 'sch_b', { parentIc: '900202-10-1234', parentName: 'Other', parentEmail: 'AMINAH@test.my', parentPhone: '0199990000' });
  assert.equal(byEmail.status, 409);
  assert.equal(byEmail.data.code, 'duplicate_contact');
  assert.equal(byEmail.data.matches[0].id, first.data.parentId);
  assert.deepEqual(byEmail.data.matches[0].matchedOn, ['email']);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM students WHERE school_id = 'sch_b'").n, 0);

  // New IC, same phone in another format.
  const byPhone = await register(t, 'adminB', 'sch_b', { parentIc: '900202-10-1234', parentName: 'Other', parentPhone: '+60 12 345 6789' });
  assert.equal(byPhone.status, 409);
  assert.deepEqual(byPhone.data.matches[0].matchedOn, ['phone']);

  // "Create anyway" needs a reason.
  const noReason = await register(t, 'adminB', 'sch_b', { parentIc: '900202-10-1234', parentName: 'Other', parentEmail: 'aminah.family@test.my', parentPhone: '012-3456789', createAnyway: true });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.data.code, 'reason_required');
  // "Create anyway" is allowed for a shared phone; a shared email would collide with the existing login.
  const created = await register(t, 'adminB', 'sch_b', {
    parentIc: '900202-10-1234',
    parentName: 'Other',
    parentEmail: 'aminah.family@test.my',
    parentPhone: '012-3456789',
    createAnyway: true,
    duplicateReason: 'Shared family email',
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.notEqual(created.data.parentId, first.data.parentId);
  assert.equal(t.one('SELECT duplicate_reason FROM parents WHERE id = ?', created.data.parentId).duplicate_reason, 'Shared family email');

  // "Link to existing" uses the matched record.
  const linked = await register(t, 'adminB', 'sch_b', { parentId: first.data.parentId, parentEmail: 'aminah@test.my' });
  assert.equal(linked.status, 201);
  assert.equal(linked.data.parentId, first.data.parentId);
});

test('manual creation and bulk import apply the same duplicate check', async () => {
  const t = await setup();
  const first = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my' });
  const studentId = first.data.studentId;

  const manual = await t.call('adminA', 'POST', '/parents', { studentId, ic: '700303-03-3333', fullName: 'Second', email: 'aminah@test.my', phone: '0130000000' });
  assert.equal(manual.status, 409);
  assert.equal(manual.data.code, 'duplicate_contact');

  const manualIc = await t.call('adminA', 'POST', '/parents', { studentId, ic: IC, fullName: 'Aminah again' });
  assert.equal(manualIc.status, 200);
  assert.equal(manualIc.data.linked, true);
  assert.equal(manualIc.data.id, first.data.parentId);

  const dry = await t.call('adminA', 'POST', '/imports', {
    type: 'students',
    rows: [{ full_name: 'Imported Child', ic: 'BC1234567', parent_name: 'Someone', parent_ic: '770707-07-7777', parent_email: 'aminah@test.my', parent_phone: '0170000999' }],
  });
  assert.equal(dry.status, 201, JSON.stringify(dry.data));
  assert.equal(dry.data.batch.duplicates, 1);
  assert.equal(dry.data.report.rows[0].duplicates[0].id, first.data.parentId);

  const confirmNoChoice = await t.call('adminA', 'POST', `/imports/${dry.data.batch.id}/confirm`, {});
  assert.equal(confirmNoChoice.status, 409);
  const confirmCreateNoReason = await t.call('adminA', 'POST', `/imports/${dry.data.batch.id}/confirm`, { duplicateAction: 'create' });
  assert.equal(confirmCreateNoReason.status, 400);
  const confirmLink = await t.call('adminA', 'POST', `/imports/${dry.data.batch.id}/confirm`, { duplicateAction: 'link' });
  assert.equal(confirmLink.status, 200, JSON.stringify(confirmLink.data));
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 1);

  // Import IC values are not stored in plain text in the report.
  const dryIc = await t.call('adminA', 'POST', '/imports', {
    type: 'parents',
    rows: [{ full_name: 'Ic Parent', ic: '650505-05-5050', email: 'icparent@test.my', phone: '0145555555' }],
  });
  const report = t.one('SELECT report_json FROM import_batches WHERE id = ?', dryIc.data.batch.id).report_json;
  assert.ok(!report.includes('650505'));
  assert.ok(!JSON.stringify(dryIc.data).includes('_enc'));
});

test('School Admin cannot edit a parent whose linked students are all in another school', async () => {
  const t = await setup();
  const reg = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my' });
  const pid = reg.data.parentId;

  const before = t.one('SELECT phone FROM parents WHERE id = ?', pid).phone;
  const denied = await t.call('adminB', 'PATCH', `/parents/${pid}`, { phone: '0199999999' });
  assert.equal(denied.status, 403);
  assert.equal(t.one('SELECT phone FROM parents WHERE id = ?', pid).phone, before);

  const allowed = await t.call('adminA', 'PATCH', `/parents/${pid}`, { phone: '0199999999' });
  assert.equal(allowed.status, 200);
  assert.equal(t.one('SELECT phone FROM parents WHERE id = ?', pid).phone, '0199999999');

  // Parents can update their own contact details.
  const parentUser = parentUserOf(t, pid, 'sch_a');
  const own = await t.call(parentUser, 'PATCH', '/portal/contact', { phone: '0188888888' });
  assert.equal(own.status, 200);
  assert.equal(t.one('SELECT phone FROM parents WHERE id = ?', pid).phone, '0188888888');
});

test('School Admin cannot delete or deactivate a parent; Super Admin can', async () => {
  const t = await setup();
  const reg = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my' });
  const pid = reg.data.parentId;
  const userId = t.one('SELECT user_id FROM parents WHERE id = ?', pid).user_id;
  assert.ok(userId);

  assert.equal((await t.call('adminA', 'POST', `/parents/${pid}/status`, { status: 'inactive' })).status, 403);
  assert.equal((await t.call('adminA', 'DELETE', `/parents/${pid}`)).status, 403);
  assert.equal((await t.call('adminA', 'PATCH', `/users/${userId}`, { status: 'inactive' })).status, 403);
  assert.equal(t.one('SELECT status FROM parents WHERE id = ?', pid).status, 'active');
  assert.equal(t.one('SELECT status FROM users WHERE id = ?', userId).status, 'active');

  const deactivate = await t.call('super', 'POST', `/parents/${pid}/status`, { status: 'inactive' });
  assert.equal(deactivate.status, 200);
  assert.equal(t.one('SELECT status FROM parents WHERE id = ?', pid).status, 'inactive');
  assert.equal(t.one('SELECT status FROM users WHERE id = ?', userId).status, 'inactive');

  const del = await t.call('super', 'DELETE', `/parents/${pid}`);
  assert.equal(del.status, 200);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 0);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parent_students').n, 0);
});

test('a parent with children at two schools sees two cards and a summed total', async () => {
  const t = await setup();
  const a = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my' });
  const b = await register(t, 'adminB', 'sch_b', { parentIc: IC });
  assert.equal(b.data.parentId, a.data.parentId);
  // Registration invoices: A = 200.00, B = 200.00. Add a monthly invoice at B.
  await createInvoice(t.env, {
    schoolId: 'sch_b', studentId: b.data.studentId, type: 'monthly', period: '2026-02', dueDate: '2026-02-10', amountCents: 10000, description: 'Feb',
  });

  const parentUser = parentUserOf(t, a.data.parentId, 'sch_a');
  const res = await t.call(parentUser, 'GET', '/portal/children');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { children, schools, totalOutstanding } = res.data;
  assert.equal(children.length, 2);
  const cardA = children.find((c) => c.school_id === 'sch_a');
  const cardB = children.find((c) => c.school_id === 'sch_b');
  assert.equal(cardA.school_name, 'Sekolah A');
  assert.equal(cardB.school_name, 'Sekolah B');
  assert.equal(cardA.outstanding, 20000);
  assert.equal(cardB.outstanding, 30000);
  assert.equal(cardB.invoices.length, 2);
  assert.ok(cardB.next_due);
  assert.equal(schools.length, 2);
  assert.equal(totalOutstanding, cardA.outstanding + cardB.outstanding);

  // Only linked children are visible.
  const other = await register(t, 'adminA', 'sch_a', { parentIc: '910101-01-0101', parentName: 'Other', parentEmail: 'other@test.my' });
  const otherUser = parentUserOf(t, other.data.parentId, 'sch_a');
  const otherView = await t.call(otherUser, 'GET', '/portal/children');
  assert.equal(otherView.data.children.length, 1);
  assert.equal((await t.call(otherUser, 'GET', `/portal/children/${a.data.studentId}`)).status, 403);
});

test("credit at one school does not pay the other school's invoices", async () => {
  const t = await setup();
  const a = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my' });
  const b = await register(t, 'adminB', 'sch_b', { parentIc: IC });

  // Each Bursar records only their school's share of one transfer (same bank reference).
  const payA = await t.call('adminA', 'POST', '/payments', { studentId: a.data.studentId, amountCents: 50000, method: 'bank', bankRef: 'TRF-001' });
  assert.equal(payA.status, 201, JSON.stringify(payA.data));
  assert.equal(payA.data.credit.amount_cents, 30000); // 500.00 paid against 200.00 due at A
  const payB = await t.call('adminB', 'POST', '/payments', { studentId: b.data.studentId, amountCents: 5000, method: 'bank', bankRef: 'TRF-001' });
  assert.equal(payB.status, 201);
  // A school cannot record a payment for another school's student.
  assert.equal((await t.call('adminA', 'POST', '/payments', { studentId: b.data.studentId, amountCents: 100, method: 'cash' })).status, 404);

  // A credit row for school A, even if attached to school B's student, is never used at B.
  t.sql("INSERT INTO credits (id, school_id, student_id, amount_cents, remaining_cents, source, created_at) VALUES ('crd_x','sch_a',?,9999,9999,'test','2026-01-01')", b.data.studentId);
  const { invoice } = await createInvoice(t.env, {
    schoolId: 'sch_b', studentId: b.data.studentId, type: 'monthly', period: '2026-02', dueDate: '2026-02-10', amountCents: 10000, description: 'Feb',
  });
  const inv = t.one('SELECT * FROM invoices WHERE id = ?', invoice.id);
  assert.equal(inv.credited_cents, 0);
  assert.equal(inv.status, 'unpaid');
  assert.equal(t.one("SELECT remaining_cents FROM credits WHERE school_id = 'sch_a' AND student_id = ?", a.data.studentId).remaining_cents, 30000);
  assert.equal(t.one("SELECT remaining_cents FROM credits WHERE id = 'crd_x'").remaining_cents, 9999);

  // Same-school credit is still applied.
  const { invoice: invA } = await createInvoice(t.env, {
    schoolId: 'sch_a', studentId: a.data.studentId, type: 'monthly', period: '2026-02', dueDate: '2026-02-10', amountCents: 10000, description: 'Feb',
  });
  assert.equal(t.one('SELECT credited_cents FROM invoices WHERE id = ?', invA.id).credited_cents, 10000);
});

test('a student who withdraws keeps that school’s arrears there', async () => {
  const t = await setup();
  const a = await register(t, 'adminA', 'sch_a', { parentIc: IC, parentName: 'Aminah', parentEmail: 'aminah@test.my' });
  const b = await register(t, 'adminB', 'sch_b', { parentIc: IC });
  const res = await t.call('adminA', 'PATCH', `/students/${a.data.studentId}`, { status: 'withdrawn' });
  assert.equal(res.status, 200);
  const arrearsA = t.one("SELECT SUM(amount_cents - paid_cents - credited_cents - waived_cents) AS n FROM invoices WHERE school_id = 'sch_a' AND status IN ('unpaid','partial')").n;
  assert.equal(arrearsA, 20000);
  const parentUser = parentUserOf(t, a.data.parentId, 'sch_b');
  const portal = await t.call(parentUser, 'GET', '/portal/children');
  assert.equal(portal.data.children.find((c) => c.school_id === 'sch_a').outstanding, 20000);
  assert.equal(portal.data.children.find((c) => c.school_id === 'sch_b').outstanding, 20000);
  assert.equal(b.status, 201);
});

test('the public application form does not create a parent', async () => {
  const t = await setup();
  const res = await t.call('super', 'POST', '/public/applications', {
    schoolId: 'sch_a',
    category: 'tahfiz',
    studentName: 'Applicant',
    dob: '2015-01-01',
    gender: 'male',
    parentName: 'Applicant Parent',
    parentEmail: 'new@test.my',
    parentPhone: '0123456789',
    parentIc: IC,
    ic: 'AB1234567',
    reason: 'Interest',
    education: 'Primary',
    consent: true,
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parents').n, 0);
  assert.equal(t.one('SELECT COUNT(*) AS n FROM parent_students').n, 0);
  assert.equal(t.one("SELECT COUNT(*) AS n FROM users WHERE email = 'new@test.my'").n, 0);
});

test('existing databases gain the new parent columns and link schools', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync } = await import('node:fs');
  const { ensureSchema } = await import('../worker/src/lib/migrate.js');
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  raw.exec(`INSERT INTO schools (id, name, category, created_at) VALUES ('s1','S1','tahfiz','x');
    INSERT INTO students (id, school_id, full_name, created_at) VALUES ('st1','s1','Kid','x');
    INSERT INTO parents (id, full_name, phone, created_at) VALUES ('p1','P','+60 12-345 6789','x');
    INSERT INTO parent_students (id, parent_id, student_id) VALUES ('ps1','p1','st1');`);
  const t = await setup();
  const DB = Object.assign(Object.create(Object.getPrototypeOf(t.DB)), { db: raw });
  await ensureSchema({ DB });
  await ensureSchema({ DB: Object.assign(Object.create(Object.getPrototypeOf(t.DB)), { db: raw }) }); // repeatable
  const p = raw.prepare('SELECT * FROM parents').get();
  assert.equal(p.status, 'active');
  assert.equal(p.phone_norm, '0123456789');
  assert.equal(raw.prepare('SELECT school_id FROM parent_students').get().school_id, 's1');
});
