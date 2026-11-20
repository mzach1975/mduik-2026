// CR-PR 2026-11-20: Super Admin reports (PR-1), real .xlsx (PR-2), global email
// templates (CR-1/CR-2), audit retention (CR-3), fewer audited actions (CR-5),
// migration backups removed (CR-7), Super Admin bootstrap (CR-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
import worker from '../worker/src/index.js';
import { signToken, SESSION_COOKIE } from '../worker/src/lib/auth.js';
import { purgeAuditLogs } from '../worker/src/lib/finance.js';
import { ensureSchema } from '../worker/src/lib/migrate.js';

const base = { ic: '150101-14-1234', classId: 'cls_a', placement: 'boarding' };

async function download(t, who, path) {
  const u = t.users[who];
  const token = await signToken(t.env, { sub: u.id, sch: u.school || null });
  const res = await worker.fetch(new Request(`http://test/api${path}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }), t.env, { waitUntil() {} });
  return { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), bytes: new Uint8Array(await res.arrayBuffer()) };
}

test('PR-1: Super Admin reports cover all madrasahs, or the one picked', async () => {
  const t = await setup();
  assert.equal((await t.call('adminA', 'POST', '/students', { ...base, fullName: 'Ali' })).status, 201);
  assert.equal((await t.call('adminB', 'POST', '/students', { ...base, fullName: 'Abu', ic: '150101-14-9999', classId: 'cls_b' })).status, 201);
  const all = await t.call('super', 'GET', '/reports/student-records');
  assert.equal(all.status, 200);
  assert.deepEqual(all.data.rows.map((r) => r.full_name).sort(), ['Abu', 'Ali']);
  assert.equal(all.data.columns[0].key, 'school_name');
  assert.deepEqual(all.data.rows.map((r) => r.school_name).sort(), ['Sekolah A', 'Sekolah B']);
  const one = await t.call('super', 'GET', '/reports/student-records?school=sch_b');
  assert.deepEqual(one.data.rows.map((r) => r.full_name), ['Abu']);
  // School Admin stays on their own madrasah even if they pass ?school=.
  const own = await t.call('adminA', 'GET', '/reports/student-records?school=sch_b');
  assert.deepEqual(own.data.rows.map((r) => r.full_name), ['Ali']);
  assert.notEqual(own.data.columns[0].key, 'school_name');
});

test('PR-2: Excel export is a real .xlsx workbook', async () => {
  const t = await setup();
  await t.call('adminA', 'POST', '/students', { ...base, fullName: 'Ali <&> "Bin"' });
  const res = await download(t, 'adminA', '/reports/student-records?format=xls');
  assert.equal(res.status, 200);
  assert.equal(res.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(res.disposition, /\.xlsx"/);
  assert.deepEqual([...res.bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]); // zip
  const text = new TextDecoder().decode(res.bytes);
  assert.ok(text.includes('[Content_Types].xml') && text.includes('xl/worksheets/sheet1.xml'));
  assert.ok(text.includes('Ali &lt;&amp;&gt; &quot;Bin&quot;'));
  // Sheet names may not contain "/" (the old titles did).
  assert.ok(!/<sheet name="[^"]*\//.test(text));
});

test('CR-1/CR-2: Super Admin lists, edits, switches off and restores email templates', async () => {
  const t = await setup();
  assert.equal((await t.call('adminA', 'GET', '/email-templates')).status, 403);
  const list = await t.call('super', 'GET', '/email-templates');
  assert.equal(list.status, 200);
  const tracking = list.data.templates.find((x) => x.key === 'tracking_off');
  assert.ok(tracking && tracking.enabled && !tracking.customised && tracking.vars.includes('student_name'));

  // Unknown placeholders and empty text are rejected.
  const badVar = await t.call('super', 'PATCH', '/email-templates/tracking_off', { bodyEn: 'Hi {{nope}}' });
  assert.equal(badVar.data.code, 'template_unknown_vars');
  assert.equal((await t.call('super', 'PATCH', '/email-templates/tracking_off', { subjectBm: ' ' })).data.code, 'template_required');

  const saved = await t.call('super', 'PATCH', '/email-templates/tracking_off', { bodyBm: 'Dimatikan untuk {{student_name}}.' });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.template.customised, true);
  assert.ok(t.one("SELECT 1 AS ok FROM audit_logs WHERE entity = 'email_template' AND action = 'update'"));

  // The edited text is used for the next notification.
  const s = await t.call('adminA', 'POST', '/students', { ...base, fullName: 'Ali' });
  t.sql("INSERT INTO parents (id, full_name, email, created_at) VALUES ('par1','Ibu','ibu@test','x')");
  t.sql("INSERT INTO parent_students (id, parent_id, student_id, relationship, school_id) VALUES ('ps1','par1',?,'mother','sch_a')", s.data.id);
  await t.call('adminA', 'POST', `/students/${s.data.id}/tracking`, { enabled: false });
  let n = t.one("SELECT subject, body, email_status FROM notifications WHERE type = 'tracking_off' ORDER BY created_at DESC LIMIT 1");
  assert.ok(n.body.startsWith('Dimatikan untuk Ali.'));
  assert.ok(n.body.includes('Monthly fee tracking for Ali is switched off'));
  assert.equal(n.subject, 'Pemantauan yuran bulanan dimatikan / Monthly fee tracking switched off');

  // Switched off: the portal notification is kept, the email is not sent.
  assert.equal((await t.call('super', 'PATCH', '/email-templates/tracking_off', { enabled: false })).status, 200);
  t.sql('DELETE FROM notifications');
  await t.call('adminA', 'POST', `/students/${s.data.id}/tracking`, { enabled: false });
  n = t.one("SELECT email_status FROM notifications WHERE type = 'tracking_off'");
  assert.equal(n.email_status, 'disabled');

  // Restore default text; the on/off choice stays.
  const reset = await t.call('super', 'DELETE', '/email-templates/tracking_off');
  assert.equal(reset.data.template.customised, false);
  assert.equal(reset.data.template.enabled, false);

  // Account and password emails cannot be switched off.
  assert.equal((await t.call('super', 'PATCH', '/email-templates/password_reset', { enabled: false })).data.code, 'template_locked');
});

test('CR-3: audit entries older than 3 months are deleted by the daily job', async () => {
  const t = await setup();
  const old = new Date(Date.now() - 100 * 86400000).toISOString();
  const recent = new Date(Date.now() - 10 * 86400000).toISOString();
  t.sql("INSERT INTO audit_logs (id, action, entity, created_at) VALUES ('a_old','x','y',?), ('a_new','x','y',?)", old, recent);
  assert.equal(await purgeAuditLogs(t.env), 1);
  assert.deepEqual(t.many('SELECT id FROM audit_logs').map((r) => r.id), ['a_new']);
});

test('CR-5: creating a student and viewing records are no longer audited; updates still are', async () => {
  const t = await setup();
  const s = await t.call('adminA', 'POST', '/students', { ...base, fullName: 'Ali' });
  await t.call('adminA', 'GET', `/students/${s.data.id}`);
  await t.call('super', 'GET', '/reports/student-records');
  assert.equal(t.one('SELECT COUNT(*) AS n FROM audit_logs').n, 0);
  await t.call('adminA', 'PATCH', `/students/${s.data.id}`, { placement: 'day' });
  assert.equal(t.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'update' AND entity = 'student'").n, 1);
});

test('CR-8: BOOTSTRAP_ADMIN creates the first Super Admin, who must change the password', async () => {
  const t = await setup();
  t.sql('DELETE FROM user_roles');
  t.sql('DELETE FROM users');
  const env = {
    ...t.env,
    BOOTSTRAP_ADMIN: JSON.stringify({ fullName: 'Admin Satu', email: 'Boot@Test.my', phone: '012-3456789', ic: '800101-14-5566', language: 'en', password: '800101145566' }),
  };
  await ensureSchema(env);
  const u = t.one("SELECT u.*, ur.role, ur.school_id FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE u.email = 'boot@test.my'");
  assert.equal(u.role, 'super_admin');
  assert.equal(u.school_id, null);
  assert.equal(u.must_change_password, 1);
  assert.equal(u.language, 'en');
  assert.equal(u.ic_masked, '********5566');
  // Sign in by email or IC.
  for (const id of ['boot@test.my', '800101145566']) {
    const res = await worker.fetch(
      new Request('http://test/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, identifier: id, password: '800101145566' }) }),
      env,
      { waitUntil() {} },
    );
    assert.equal(res.status, 200, id);
  }
});
