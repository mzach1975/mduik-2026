// CR-PR 2026-11-11: interview date fix (PR-1), application form (CR-1..CR-5),
// status page (CR-6), interview checklist (CR-7) and one-or-more interviewers (CR-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';

const yearsAgo = (n) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
};

function teacher(t, key, school = 'sch_a') {
  const uid = `usr_${key}`;
  t.sql("INSERT INTO users (id, email, full_name, password_hash, status, created_at) VALUES (?,?,?,'x','active','x')", uid, `${key}@test`, key);
  t.sql("INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,'teacher','x','active')", `url_${key}`, uid, school);
  return { id: uid, school };
}

function draftDoc(t, id) {
  t.sql("INSERT INTO documents (id, owner_type, owner_id, filename, content_type, size, created_at) VALUES (?,'application_draft','draft','f.pdf','application/pdf',10,'x')", id);
  return id;
}

let docSeq = 0;
function apply(t, over = {}) {
  return t.call('super', 'POST', '/public/applications', {
    schoolId: 'sch_a',
    studentName: 'Ali',
    ic: 'MK1234567',
    dob: yearsAgo(8),
    gender: 'male',
    parentName: 'Abu',
    parentEmail: 'abu@test.my',
    parentPhone: '012-345 6789',
    reason: 'Minat',
    education: 'Rendah',
    consent: true,
    documents: [draftDoc(t, `doc_${++docSeq}`)],
    ...over,
  });
}

const ALL_MARKS = {
  s1_tajwid: 8, s1_makhraj: 8, s1_fluency: 4, s2_syahadah: 2, s2_islam: 8, s2_iman: 8,
  s3_prayer: 8, s3_subuh: 2, s4_eating: 4, s4_sleeping: 4, s5_read_jawi: 4, s5_write_jawi: 4, s5_memorise: 8, s6_hafazan: 8,
};

test('PR-1: an interview can be scheduled with the date the browser sends', async () => {
  const t = await setup();
  const t1 = teacher(t, 't1');
  const appId = t.acceptedApplication('sch_a');
  t.sql("UPDATE applications SET status = 'submitted' WHERE id = ?", appId);
  for (const scheduledAt of ['2026-12-01T02:00:00.000Z', '2026-12-01T10:00', '2026-12-01T10:00:00+08:00']) {
    const res = await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt, assessorIds: [t1.id] });
    assert.equal(res.status, 201, `${scheduledAt}: ${JSON.stringify(res.data)}`);
  }
  const bad = await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt: 'tomorrow', assessorIds: [t1.id] });
  assert.equal(bad.status, 400);
  assert.equal(t.one('SELECT status FROM applications WHERE id = ?', appId).status, 'interview');
});

test('CR-8: at least one teacher is assigned as interviewer, and more are allowed', async () => {
  const t = await setup();
  const [t1, t2, t3] = ['t1', 't2', 't3'].map((k) => teacher(t, k));
  const other = teacher(t, 'tb', 'sch_b');
  const appId = t.acceptedApplication('sch_a');
  const at = '2026-12-01T10:00';
  assert.equal((await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt: at, assessorIds: [] })).status, 400);
  assert.equal((await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt: at, assessorIds: [other.id] })).status, 400);
  assert.equal((await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt: at, assessorIds: [t1.id, t2.id, t3.id] })).status, 201);

  // With one interviewer, their score completes the interview.
  const one = await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt: at, assessorIds: [t1.id] });
  const score = await t.call(t1, 'POST', `/interviews/${one.data.id}/score`, { marks: ALL_MARKS });
  assert.equal(score.status, 200, JSON.stringify(score.data));
  assert.equal(t.one('SELECT status FROM interviews WHERE id = ?', one.data.id).status, 'completed');
});

test('CR-7: checklist items carry a tick and a remark; unknown items are dropped', async () => {
  const t = await setup();
  const t1 = teacher(t, 't1');
  const appId = t.acceptedApplication('sch_a');
  const iv = await t.call('adminA', 'POST', `/applications/${appId}/schedule`, { scheduledAt: '2026-12-01T10:00', assessorIds: [t1.id] });
  const rubric = (await t.call(t1, 'GET', `/interviews/${iv.data.id}`)).data.rubric;
  assert.deepEqual(rubric.checklist.map((s) => s.items.length), [4, 4]);
  const res = await t.call(t1, 'POST', `/interviews/${iv.data.id}/score`, {
    marks: ALL_MARKS,
    checklist: {
      c7_rules: { checked: true, remark: '  Faham  ' },
      c8_prayer: { checked: false, remark: 'Perlu bimbingan' },
      c8_social: { checked: false, remark: '' },
      hack: { checked: true, remark: 'x' },
    },
  });
  assert.equal(res.status, 200);
  const marks = JSON.parse(t.one('SELECT marks FROM scores WHERE interview_id = ?', iv.data.id).marks);
  assert.deepEqual(marks.checklist, {
    c7_rules: { checked: true, remark: 'Faham' },
    c8_prayer: { checked: false, remark: 'Perlu bimbingan' },
  });
});

test('CR-1/CR-2: no category on the form, minimum age 7 and no maximum', async () => {
  const t = await setup();
  const ok = await apply(t);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.status, 'submitted');
  assert.equal(t.one('SELECT category FROM applications WHERE id = ?', ok.data.id).category, 'tahfiz');

  const young = await apply(t, { dob: yearsAgo(6) });
  assert.equal(young.data.status, 'incomplete');
  assert.equal(young.data.flags.ageEligible, false);

  const older = await apply(t, { dob: yearsAgo(30) });
  assert.equal(older.data.status, 'submitted');
  assert.equal(older.data.flags.ageEligible, true);
});

test('CR-3: a supporting document is required', async () => {
  const t = await setup();
  const none = await apply(t, { documents: [] });
  assert.equal(none.status, 400);
  assert.equal(none.data.code, 'documents_required');
  const fake = await apply(t, { documents: ['doc_missing'] });
  assert.equal(fake.data.code, 'documents_required');
  assert.equal(t.one('SELECT COUNT(*) AS n FROM applications').n, 0);
});

test('CR-4/CR-5: confirmation to the parent and notice to School Admin and the school email', async () => {
  const t = await setup();
  t.sql("UPDATE schools SET email = 'office@sch-a.my' WHERE id = 'sch_a'");
  const res = await apply(t);
  const rows = t.many("SELECT recipient_email, user_id, body FROM notifications WHERE type = 'application_received'");
  const parent = rows.find((r) => r.recipient_email === 'abu@test.my');
  assert.ok(parent && /akan diproses/.test(parent.body) && parent.body.includes(res.data.reference));
  assert.ok(rows.some((r) => r.user_id === 'usr_adminA'));
  assert.ok(rows.some((r) => r.recipient_email === 'office@sch-a.my'));
  assert.ok(!rows.some((r) => r.user_id === 'usr_adminB'));
});

test('CR-6: status check matches a phone typed differently and shows school contact', async () => {
  const t = await setup();
  t.sql("UPDATE schools SET phone = '03-1234567', email = 'office@sch-a.my' WHERE id = 'sch_a'");
  const res = await apply(t);
  const q = `/public/applications/status?reference=${encodeURIComponent(res.data.reference.toLowerCase())}&contact=${encodeURIComponent('0123456789')}`;
  const st = await t.call('super', 'GET', q);
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.equal(st.data.application.schoolPhone, '03-1234567');
  assert.equal(st.data.application.documentsCount, 1);
  const wrong = await t.call('super', 'GET', `/public/applications/status?reference=${encodeURIComponent(res.data.reference)}&contact=0199999999`);
  assert.equal(wrong.status, 404);
});
