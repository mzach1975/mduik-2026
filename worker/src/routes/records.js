import { Hono } from 'hono';
import { authMiddleware, requireRoles, encryptIc, hashIc, hashPassword, revokeAllSessions } from '../lib/auth.js';
import { id, nowIso, today, readJson, bad, json, pageParams, pagingMeta, yearOf, monthOf, stripIc, normalizeIc } from '../lib/util.js';
import {
  planParent,
  planFailure,
  commitParent,
  linkParentToStudent,
  findParentByIc,
  parentInSchool,
  publicParent,
  normalizePhone,
} from '../lib/parents.js';
import { audit, auditView } from '../lib/audit.js';
import { notify, notifyParentsOfStudent, subjectFor } from '../lib/notify.js';
import { studentBalance, createInvoice, dueDateFor, generateRegistrationInvoices } from '../lib/finance.js';
import { buildReceiptPdf } from '../lib/pdf.js';

const records = new Hono();
records.use('*', authMiddleware);

const staffOnly = requireRoles('school_admin', 'bursar');

records.get('/students', staffOnly, async (c) => {
  const auth = c.get('auth');
  const { page, pageSize, offset } = pageParams(c);
  const where = ['s.school_id = ?'];
  const binds = [auth.activeSchool];
  const q = c.req.query('q');
  if (q) {
    where.push('(s.full_name LIKE ? OR s.class_name LIKE ? OR s.ic_masked LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (c.req.query('status')) {
    where.push('s.status = ?');
    binds.push(c.req.query('status'));
  }
  if (c.req.query('tracking') === 'on') where.push('s.monthly_tracking = 1');
  if (c.req.query('tracking') === 'off') where.push('s.monthly_tracking = 0');
  if (c.req.query('class')) {
    where.push('s.class_name = ?');
    binds.push(c.req.query('class'));
  }
  const w = where.join(' AND ');
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM students s WHERE ${w}`).bind(...binds).first();
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, f.name AS fee_plan_name,
       (SELECT COALESCE(SUM(i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents),0)
        FROM invoices i WHERE i.student_id = s.id AND i.status IN ('unpaid','partial')) AS outstanding,
       (SELECT COALESCE(SUM(cr.remaining_cents),0) FROM credits cr WHERE cr.student_id = s.id) AS credit
     FROM students s LEFT JOIN fee_plans f ON f.id = s.fee_plan_id
     WHERE ${w} ORDER BY s.full_name LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return json({ students: results.map(stripIc), ...pagingMeta(count?.n || 0, page, pageSize) });
});

records.get('/students/classes', staffOnly, async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    "SELECT class_name, COUNT(*) AS n FROM students WHERE school_id = ? AND class_name IS NOT NULL AND class_name != '' GROUP BY class_name ORDER BY class_name",
  )
    .bind(auth.activeSchool)
    .all();
  return json({ classes: results });
});

records.get('/students/:id', staffOnly, async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Pelajar tidak dijumpai. / Student not found.', 404);
  const parents = await c.env.DB.prepare(
    `SELECT p.*, ps.relationship FROM parents p JOIN parent_students ps ON ps.parent_id = p.id WHERE ps.student_id = ?`,
  )
    .bind(studentId)
    .all();
  const invoices = await c.env.DB.prepare('SELECT * FROM invoices WHERE student_id = ? ORDER BY issue_date DESC')
    .bind(studentId)
    .all();
  const payments = await c.env.DB.prepare(
    `SELECT p.*, r.number AS receipt_number FROM payments p LEFT JOIN receipts r ON r.id = p.receipt_id
     WHERE p.student_id = ? ORDER BY p.paid_at DESC`,
  )
    .bind(studentId)
    .all();
  const balance = await studentBalance(c.env, studentId);
  const adjustments = await c.env.DB.prepare('SELECT * FROM fee_adjustments WHERE student_id = ? ORDER BY created_at DESC')
    .bind(studentId)
    .all();
  await auditView(c, 'student', studentId, student.full_name);
  return json({ student: stripIc(student), parents: parents.results.map(publicParent), invoices: invoices.results, payments: payments.results, balance, adjustments: adjustments.results });
});

records.post('/students', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (!body.fullName) return bad('Nama pelajar diperlukan. / Student name is required.');
  const wantsParent = body.parentId || body.parentIc || body.parentName || body.parentEmail || body.parentPhone;
  const parentPlan = wantsParent
    ? await planParent(
        c.env,
        {
          parentId: body.parentId || null,
          ic: body.parentIc,
          name: body.parentName,
          email: body.parentEmail,
          phone: body.parentPhone,
          address: body.parentAddress || body.address,
          createAnyway: body.createAnyway === true,
          duplicateReason: body.duplicateReason,
        },
        { schoolId: auth.activeSchool },
      )
    : null;
  const parentFailure = parentPlan && planFailure(parentPlan);
  if (parentFailure) return parentFailure;
  const ic = body.ic ? await encryptIc(c.env, body.ic) : { enc: null, hash: null, masked: null };
  const plan = body.feePlanId
    ? await c.env.DB.prepare('SELECT * FROM fee_plans WHERE id = ?').bind(body.feePlanId).first()
    : await c.env.DB.prepare('SELECT * FROM fee_plans WHERE school_id = ? AND active = 1 ORDER BY created_at LIMIT 1')
        .bind(auth.activeSchool)
        .first();
  const studentId = id('std');
  await c.env.DB.prepare(
    `INSERT INTO students (id, school_id, full_name, ic_hash, ic_enc, ic_masked, dob, gender, class_name, address, phone, email,
      fee_plan_id, monthly_fee_cents, monthly_tracking, tracking_start, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      studentId,
      auth.activeSchool,
      body.fullName,
      ic.hash,
      ic.enc,
      ic.masked,
      body.dob || null,
      body.gender || null,
      body.className || '',
      body.address || '',
      body.phone || '',
      body.email || '',
      plan?.id || null,
      Number(body.monthlyFeeCents ?? plan?.monthly_fee_cents ?? auth.school.monthly_fee_cents),
      body.monthlyTracking ? 1 : 0,
      body.monthlyTracking ? nextMonthStart() : null,
      body.status || 'active',
      nowIso(),
    )
    .run();
  let parentId = null;
  if (parentPlan) {
    const parent = await commitParent(c.env, parentPlan);
    parentId = parent.id;
    await linkParentToStudent(c.env, parentId, studentId, auth.activeSchool, body.relationship);
    if (parentPlan.create) {
      await audit(c, 'create', 'parent', parentId, {
        after: { via: 'student', studentId, duplicateReason: parentPlan.create.duplicateReason, duplicateOf: parentPlan.create.duplicateOf },
      });
    }
  }
  await audit(c, 'create', 'student', studentId, { after: { fullName: body.fullName, parentId } });
  return json({ id: studentId }, 201);
});

records.patch('/students/:id', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Not found', 404);
  const body = await readJson(c);
  const allowed = ['full_name', 'dob', 'gender', 'class_name', 'address', 'phone', 'email', 'status', 'fee_plan_id', 'monthly_fee_cents'];
  const updates = {};
  for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];
  if (body.status && !['active', 'withdrawn', 'graduated', 'applicant'].includes(body.status)) return bad('Status tidak sah. / Invalid status.');
  if (body.ic) {
    const ic = await encryptIc(c.env, body.ic);
    updates.ic_enc = ic.enc;
    updates.ic_hash = ic.hash;
    updates.ic_masked = ic.masked;
  }
  if (!Object.keys(updates).length) return bad('Tiada perubahan. / Nothing to update.');
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE students SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...Object.values(updates), nowIso(), studentId)
    .run();
  const before = {};
  for (const k of Object.keys(updates)) before[k] = student[k];
  await audit(c, 'update', 'student', studentId, { before, after: updates });
  return json({ ok: true });
});

records.post('/students/:id/tracking', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Not found', 404);
  const body = await readJson(c);
  const enabled = !!body.enabled;
  const trackingStart = enabled ? nextMonthStart() : null;
  await c.env.DB.prepare('UPDATE students SET monthly_tracking = ?, tracking_start = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, trackingStart, studentId)
    .run();
  await notifyParentsOfStudent(c.env, studentId, {
    schoolId: auth.activeSchool,
    type: enabled ? 'tracking_on' : 'tracking_off',
    subject: subjectFor(enabled ? 'tracking_on' : 'tracking_off', 'bm'),
    body: enabled
      ? `Pemantauan yuran bulanan untuk ${student.full_name} telah dihidupkan. Invois bulanan pertama akan dijana pada 1 ${trackingStart}.\nMonthly fee tracking for ${student.full_name} is switched on. The first monthly invoice will be generated on 1 ${trackingStart}.`
      : `Pemantauan yuran bulanan untuk ${student.full_name} telah dimatikan. Tiada invois bulanan baharu akan dijana; invois sedia ada masih perlu dibayar.\nMonthly fee tracking for ${student.full_name} is switched off. No new monthly invoices will be generated; existing invoices remain payable.`,
    language: 'bm',
  });
  await audit(c, 'tracking_toggle', 'student', studentId, {
    before: { monthly_tracking: student.monthly_tracking, tracking_start: student.tracking_start },
    after: { monthly_tracking: enabled ? 1 : 0, tracking_start: trackingStart },
  });
  return json({ ok: true, monthlyTracking: enabled ? 1 : 0, trackingStart });
});

function nextMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
}

records.post('/students/:id/reminders', requireRoles('school_admin', 'bursar'), async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Not found', 404);
  const body = await readJson(c);
  await c.env.DB.prepare('UPDATE students SET reminders_enabled = ? WHERE id = ?')
    .bind(body.enabled ? 1 : 0, studentId)
    .run();
  await audit(c, 'reminders_toggle', 'student', studentId, { before: { reminders_enabled: student.reminders_enabled }, after: { reminders_enabled: body.enabled ? 1 : 0 } });
  return json({ ok: true, remindersEnabled: body.enabled ? 1 : 0 });
});

records.post('/students/:id/registration-invoice', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Not found', 404);
  const year = yearOf(today());
  const dueDate = dueDateFor(year, auth.school.reg_due_month, auth.school.reg_due_day);
  const plan = student.fee_plan_id
    ? await c.env.DB.prepare('SELECT * FROM fee_plans WHERE id = ?').bind(student.fee_plan_id).first()
    : null;
  const amount = plan?.registration_fee_cents ?? auth.school.registration_fee_cents;
  const { invoice, created } = await createInvoice(c.env, {
    schoolId: auth.activeSchool,
    studentId,
    type: 'registration',
    period: String(year),
    issueDate: today(),
    dueDate,
    amountCents: amount,
    description: `Yuran pendaftaran ${year} / Registration fee ${year}`,
  });
  if (created) await audit(c, 'create', 'invoice', invoice.id, { after: { type: 'registration', period: year, amount } });
  return json({ invoice, created });
});

/* ------------------------- Fee adjustments ------------------------- */
records.get('/adjustments', staffOnly, async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    `SELECT fa.*, s.full_name AS student_name, u1.full_name AS requester_name, u2.full_name AS approver_name
     FROM fee_adjustments fa JOIN students s ON s.id = fa.student_id
     LEFT JOIN users u1 ON u1.id = fa.requested_by LEFT JOIN users u2 ON u2.id = fa.approved_by
     WHERE fa.school_id = ? ORDER BY fa.created_at DESC LIMIT 100`,
  )
    .bind(auth.activeSchool)
    .all();
  return json({ adjustments: results });
});

records.post('/students/:id/adjustments', requireRoles('bursar', 'school_admin'), async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Not found', 404);
  const body = await readJson(c);
  if (!body.reason) return bad('Sebab diperlukan. / A reason is required.');
  const newRate = body.newRateCents === null || body.newRateCents === '' || body.newRateCents === undefined ? NaN : Number(body.newRateCents);
  if (!Number.isInteger(newRate) || newRate < 0 || newRate > 100000000) return bad('Kadar tidak sah. / Invalid rate.');
  const adjId = id('adj');
  await c.env.DB.prepare(
    `INSERT INTO fee_adjustments (id, school_id, student_id, old_rate_cents, new_rate_cents, reason, status, requested_by, created_at)
     VALUES (?,?,?,?,?,?,'pending',?,?)`,
  )
    .bind(adjId, auth.activeSchool, studentId, student.monthly_fee_cents, newRate, body.reason, auth.user.id, nowIso())
    .run();
  await audit(c, 'request', 'fee_adjustment', adjId, { after: { studentId, oldRate: student.monthly_fee_cents, newRate, reason: body.reason } });
  return json({ id: adjId }, 201);
});

records.post('/adjustments/:id/approve', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const adj = await c.env.DB.prepare('SELECT * FROM fee_adjustments WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!adj) return bad('Not found', 404);
  if (adj.status !== 'pending') return bad('Permohonan sudah diproses. / Request already processed.');
  await c.env.DB.prepare("UPDATE fee_adjustments SET status = 'approved', approved_by = ?, effective_date = ? WHERE id = ?")
    .bind(auth.user.id, today(), adj.id)
    .run();
  await c.env.DB.prepare('UPDATE students SET monthly_fee_cents = ? WHERE id = ?').bind(adj.new_rate_cents, adj.student_id).run();
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(adj.student_id).first();
  await audit(c, 'approve', 'fee_adjustment', adj.id, {
    before: { rate: adj.old_rate_cents },
    after: { rate: adj.new_rate_cents, studentId: adj.student_id },
  });
  await notifyParentsOfStudent(c.env, adj.student_id, {
    schoolId: auth.activeSchool,
    type: 'fee_adjustment',
    subject: 'Pelarasan yuran diluluskan / Fee adjustment approved',
    body: `Yuran bulanan untuk ${student.full_name} telah diselaraskan kepada RM ${(adj.new_rate_cents / 100).toFixed(2)} mulai invois akan datang.\nThe monthly fee for ${student.full_name} has been adjusted to RM ${(adj.new_rate_cents / 100).toFixed(2)} from future invoices.`,
    language: 'bm',
  });
  return json({ ok: true });
});

records.post('/adjustments/:id/reject', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const adj = await c.env.DB.prepare('SELECT * FROM fee_adjustments WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!adj) return bad('Not found', 404);
  if (adj.status !== 'pending') return bad('Permohonan sudah diproses. / Request already processed.');
  const body = await readJson(c);
  await c.env.DB.prepare("UPDATE fee_adjustments SET status = 'rejected', approved_by = ? WHERE id = ? AND status = 'pending'")
    .bind(auth.user.id, adj.id)
    .run();
  await audit(c, 'reject', 'fee_adjustment', adj.id, { after: { reason: body.reason || '' } });
  return json({ ok: true });
});

/* ----------------------------- Teachers ----------------------------- */
records.get('/teachers', staffOnly, async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, u.email AS login_email, u.status AS user_status,
       (SELECT GROUP_CONCAT(s.name) FROM user_roles ur JOIN schools s ON s.id = ur.school_id WHERE ur.user_id = t.user_id AND ur.status = 'active') AS schools
     FROM teachers t LEFT JOIN users u ON u.id = t.user_id
     WHERE t.school_id = ? ORDER BY t.full_name`,
  )
    .bind(auth.activeSchool)
    .all();
  return json({ teachers: results });
});

records.post('/teachers', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (!body.fullName) return bad('Nama diperlukan. / Name is required.');
  const teacherId = id('tch');
  let userId = null;
  if (body.email && body.createLogin !== false) {
    let user = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(body.email).first();
    if (!user) {
      userId = id('usr');
      const pwd = await hashPassword(body.password || 'Mduik@2026');
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, full_name, phone, password_hash, language, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
        .bind(userId, body.email, body.fullName, body.phone || '', pwd, 'bm', 'active', nowIso())
        .run();
      user = { id: userId };
    } else userId = user.id;
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,'teacher',?,'active')",
    )
      .bind(id('url'), userId, auth.activeSchool, nowIso())
      .run();
  }
  await c.env.DB.prepare(
    'INSERT INTO teachers (id, school_id, user_id, full_name, email, phone, ic_masked, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(teacherId, auth.activeSchool, userId, body.fullName, body.email || '', body.phone || '', body.icMasked || '', 'active', nowIso())
    .run();
  await audit(c, 'create', 'teacher', teacherId, { after: { fullName: body.fullName, userId } });
  return json({ id: teacherId, userId }, 201);
});

records.patch('/teachers/:id', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const teacher = await c.env.DB.prepare('SELECT * FROM teachers WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!teacher) return bad('Not found', 404);
  const body = await readJson(c);
  const updates = {};
  for (const f of ['full_name', 'email', 'phone', 'status']) if (body[f] !== undefined) updates[f] = body[f];
  if (!Object.keys(updates).length) return bad('Tiada perubahan. / Nothing to update.');
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE teachers SET ${sets} WHERE id = ?`).bind(...Object.values(updates), teacher.id).run();
  await audit(c, 'update', 'teacher', teacher.id, { before: { status: teacher.status }, after: updates });
  return json({ ok: true });
});

/* ------------------------------ Parents ------------------------------ */
const superOnly = async (c, next) => {
  if (!c.get('auth')?.isSuper) {
    return bad('Hanya Pentadbir Super boleh memadam atau menyahaktifkan akaun ibu bapa. / Only the Super Admin can delete or deactivate a parent account.', 403);
  }
  return next();
};

const NOT_YOUR_PARENT =
  'Anda hanya boleh mengemas kini ibu bapa yang mempunyai anak di sekolah ini. / You can only edit a parent who has a child at this school.';

records.get('/parents', staffOnly, async (c) => {
  const auth = c.get('auth');
  const q = String(c.req.query('q') || '').trim();
  const { results } = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM parent_students ps JOIN students s ON s.id = ps.student_id
        WHERE ps.parent_id = p.id AND (?1 IS NULL OR s.school_id = ?1)) AS children,
       (SELECT COUNT(DISTINCT s.school_id) FROM parent_students ps JOIN students s ON s.id = ps.student_id
        WHERE ps.parent_id = p.id) AS schools
     FROM parents p
     WHERE (?1 IS NULL OR p.id IN (SELECT ps.parent_id FROM parent_students ps JOIN students s ON s.id = ps.student_id WHERE s.school_id = ?1))
       AND (?2 = '' OR p.full_name LIKE ?2 OR p.email LIKE ?2 OR p.phone LIKE ?2)
     ORDER BY p.full_name LIMIT 300`,
  )
    .bind(auth.activeSchool || null, q ? `%${q}%` : '')
    .all();
  return json({ parents: results.map(publicParent) });
});

/** IC search for the registration and parent forms. Only the keyed hash is queried. */
records.get('/parents/lookup', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const ic = c.req.query('ic') || '';
  if (normalizeIc(ic).length < 6) return bad('No. IC tidak sah. / Invalid IC number.');
  const parent = await findParentByIc(c.env, ic);
  await audit(c, 'ic_lookup', 'parent', parent?.id || null, { after: { matched: !!parent } });
  if (!parent) return json({ match: null });
  const { results: links } = await c.env.DB.prepare(
    `SELECT s.id, s.full_name, s.class_name, s.school_id, sc.name AS school_name, ps.relationship
     FROM parent_students ps JOIN students s ON s.id = ps.student_id JOIN schools sc ON sc.id = s.school_id
     WHERE ps.parent_id = ? ORDER BY sc.name, s.full_name`,
  )
    .bind(parent.id)
    .all();
  const here = auth.isSuper ? links : links.filter((l) => l.school_id === auth.activeSchool);
  return json({
    match: {
      ...publicParent(parent),
      children: here,
      linkedSchools: [...new Set(links.map((l) => l.school_name))],
    },
  });
});

records.get('/parents/:id', staffOnly, async (c) => {
  const auth = c.get('auth');
  const parent = await c.env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(c.req.param('id')).first();
  if (!parent) return bad('Not found', 404);
  const { results: children } = await c.env.DB.prepare(
    `SELECT s.*, ps.relationship, sc.name AS school_name FROM parent_students ps JOIN students s ON s.id = ps.student_id
     JOIN schools sc ON sc.id = s.school_id WHERE ps.parent_id = ?`,
  )
    .bind(parent.id)
    .all();
  if (!children.some((ch) => ch.school_id === auth.activeSchool) && !auth.isSuper) return bad('Forbidden', 403);
  const visible = auth.isSuper ? children : children.filter((ch) => ch.school_id === auth.activeSchool);
  await auditView(c, 'parent', parent.id, parent.full_name);
  return json({
    parent: publicParent(parent),
    children: visible.map(stripIc),
    canEdit: auth.isSuper || auth.roleInSchool === 'school_admin',
    canDeactivate: auth.isSuper,
  });
});

/** Manual creation. An IC match links the existing parent; an email/phone match needs "link" or a reason. */
records.post('/parents', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  let student = null;
  if (body.studentId) {
    student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?').bind(body.studentId, auth.activeSchool).first();
    if (!student) return bad('Pelajar tidak dijumpai. / Student not found.', 404);
  } else if (!auth.isSuper) {
    return bad('Pilih pelajar untuk dipautkan. / Choose a student to link.');
  }
  const plan = await planParent(
    c.env,
    {
      parentId: body.parentId || null,
      ic: body.ic,
      name: body.fullName,
      email: body.email,
      phone: body.phone,
      address: body.address,
      createAnyway: body.createAnyway === true,
      duplicateReason: body.duplicateReason,
    },
    { schoolId: auth.activeSchool, requireIc: !body.parentId },
  );
  const failure = planFailure(plan);
  if (failure) return failure;
  const parent = await commitParent(c.env, plan);
  if (student) await linkParentToStudent(c.env, parent.id, student.id, auth.activeSchool, body.relationship);
  if (plan.create) {
    await audit(c, 'create', 'parent', parent.id, {
      after: { via: 'manual', studentId: student?.id || null, duplicateReason: plan.create.duplicateReason, duplicateOf: plan.create.duplicateOf },
    });
  } else {
    await audit(c, 'link', 'parent', parent.id, { after: { via: 'manual', studentId: student?.id || null, matchedByIc: !!plan.matchedByIc } });
  }
  return json({ id: parent.id, linked: !plan.create }, plan.create ? 201 : 200);
});

/** School Admin edits only parents with a child at their school. */
records.patch('/parents/:id', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const parent = await c.env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(c.req.param('id')).first();
  if (!parent) return bad('Not found', 404);
  if (!auth.isSuper && !(await parentInSchool(c.env, parent.id, auth.activeSchool))) return bad(NOT_YOUR_PARENT, 403);
  const body = await readJson(c);
  const updates = {};
  if (body.fullName !== undefined) {
    if (!String(body.fullName).trim()) return bad('Nama diperlukan. / Name is required.');
    updates.full_name = String(body.fullName).trim().slice(0, 160);
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().slice(0, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('E-mel tidak sah. / Invalid email.');
    updates.email = email;
  }
  if (body.phone !== undefined) {
    updates.phone = String(body.phone).trim().slice(0, 40);
    updates.phone_norm = normalizePhone(updates.phone);
  }
  if (body.address !== undefined) updates.address = String(body.address).slice(0, 500);
  if (body.ic) {
    if (normalizeIc(body.ic).length < 6) return bad('No. IC tidak sah. / Invalid IC number.');
    const ic = await encryptIc(c.env, body.ic);
    const other = await c.env.DB.prepare('SELECT id FROM parents WHERE ic_hash = ? AND id != ?').bind(ic.hash, parent.id).first();
    if (other) return bad('No. IC ini milik rekod ibu bapa lain. / This IC belongs to another parent record.', 409);
    Object.assign(updates, { ic_hash: ic.hash, ic_enc: ic.enc, ic_masked: ic.masked });
  }
  if (!Object.keys(updates).length) return bad('Tiada perubahan. / Nothing to update.');
  if (updates.email && parent.user_id && updates.email.toLowerCase() !== String(parent.email || '').toLowerCase()) {
    const taken = await c.env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').bind(updates.email, parent.user_id).first();
    if (taken) return bad('E-mel sudah digunakan. / Email already in use.', 409);
  }
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const stmts = [c.env.DB.prepare(`UPDATE parents SET ${sets}, updated_at = ? WHERE id = ?`).bind(...Object.values(updates), nowIso(), parent.id)];
  if (updates.email && parent.user_id) stmts.push(c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(updates.email, parent.user_id));
  await c.env.DB.batch(stmts);
  const before = {};
  const after = {};
  for (const k of Object.keys(updates)) {
    if (k === 'ic_hash' || k === 'ic_enc' || k === 'phone_norm') continue;
    before[k] = parent[k];
    after[k] = updates[k];
  }
  await audit(c, 'update', 'parent', parent.id, { before, after });
  return json({ ok: true });
});

records.post('/parents/:id/link', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(body.studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Student not found', 404);
  const plan = await planParent(
    c.env,
    { parentId: c.req.param('id'), ic: body.parentIc, email: body.email, phone: body.phone },
    { schoolId: auth.activeSchool },
  );
  const failure = planFailure(plan);
  if (failure) return failure;
  await linkParentToStudent(c.env, plan.parent.id, student.id, auth.activeSchool, body.relationship);
  await audit(c, 'link', 'parent', plan.parent.id, { after: { studentId: student.id } });
  return json({ ok: true });
});

/** Ends (or restores) the parent's portal role. A login with other active roles stays open. */
async function setParentLogin(env, parent, active) {
  if (!parent.user_id) return;
  await env.DB.prepare("UPDATE user_roles SET status = ?, ended_at = ? WHERE user_id = ? AND role = 'parent'")
    .bind(active ? 'active' : 'inactive', active ? null : nowIso(), parent.user_id)
    .run();
  if (active) {
    await env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(parent.user_id).run();
    return;
  }
  const other = await env.DB.prepare(
    "SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role != 'parent' AND status = 'active' AND ended_at IS NULL LIMIT 1",
  )
    .bind(parent.user_id)
    .first();
  if (!other) await env.DB.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").bind(parent.user_id).run();
  await revokeAllSessions(env, parent.user_id);
}

records.post('/parents/:id/status', superOnly, async (c) => {
  const parent = await c.env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(c.req.param('id')).first();
  if (!parent) return bad('Not found', 404);
  const body = await readJson(c);
  if (!['active', 'inactive'].includes(body.status)) return bad('Status tidak sah. / Invalid status.');
  await c.env.DB.prepare('UPDATE parents SET status = ?, updated_at = ? WHERE id = ?').bind(body.status, nowIso(), parent.id).run();
  await setParentLogin(c.env, parent, body.status === 'active');
  await audit(c, body.status === 'active' ? 'activate' : 'deactivate', 'parent', parent.id, {
    before: { status: parent.status },
    after: { status: body.status },
  });
  return json({ ok: true, status: body.status });
});

records.delete('/parents/:id', superOnly, async (c) => {
  const parent = await c.env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(c.req.param('id')).first();
  if (!parent) return bad('Not found', 404);
  await setParentLogin(c.env, parent, false);
  const stmts = [
    c.env.DB.prepare('DELETE FROM parent_students WHERE parent_id = ?').bind(parent.id),
    c.env.DB.prepare('DELETE FROM parents WHERE id = ?').bind(parent.id),
  ];
  if (parent.user_id) stmts.push(c.env.DB.prepare('UPDATE users SET parent_id = NULL WHERE id = ? AND parent_id = ?').bind(parent.user_id, parent.id));
  await c.env.DB.batch(stmts);
  await audit(c, 'delete', 'parent', parent.id, { before: { full_name: parent.full_name, ic_masked: parent.ic_masked } });
  return json({ ok: true });
});

/* --------------------------- Parent portal --------------------------- */
/**
 * One card per linked child. Each card carries its own school's balance, credit,
 * next payment and open invoices; credit never offsets another school's balance.
 */
records.get('/portal/children', requireRoles('parent'), async (c) => {
  const auth = c.get('auth');
  if (!auth.parent) return json({ children: [], schools: [], totalOutstanding: 0 });
  const { results: children } = await c.env.DB.prepare(
    `SELECT s.id, s.full_name, s.class_name, s.status, s.school_id, sc.name AS school_name, sc.category,
       (SELECT COALESCE(SUM(i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents),0)
        FROM invoices i WHERE i.student_id = s.id AND i.school_id = s.school_id AND i.status IN ('unpaid','partial')) AS outstanding,
       (SELECT COALESCE(SUM(cr.remaining_cents),0) FROM credits cr WHERE cr.student_id = s.id AND cr.school_id = s.school_id) AS credit
     FROM parent_students ps JOIN students s ON s.id = ps.student_id JOIN schools sc ON sc.id = s.school_id
     WHERE ps.parent_id = ? ORDER BY sc.name, s.full_name`,
  )
    .bind(auth.parent.id)
    .all();
  const ids = children.map((ch) => ch.id);
  const { results: open } = ids.length
    ? await c.env.DB.prepare(
        `SELECT id, student_id, school_id, number, type, period, due_date, status,
           amount_cents, (amount_cents - paid_cents - credited_cents - waived_cents) AS outstanding_cents
         FROM invoices WHERE student_id IN (${ids.map(() => '?').join(',')}) AND status IN ('unpaid','partial')
         ORDER BY due_date ASC, issue_date ASC`,
      )
        .bind(...ids)
        .all()
    : { results: [] };
  const cards = children.map((ch) => {
    const invoices = open.filter((i) => i.student_id === ch.id && i.school_id === ch.school_id);
    const next = invoices[0] || null;
    return {
      ...ch,
      next_due: next?.due_date || null,
      next_due_amount: next ? next.outstanding_cents : 0,
      invoices: invoices.slice(0, 5),
      invoice_count: invoices.length,
    };
  });
  const bySchool = new Map();
  for (const ch of cards) {
    const row = bySchool.get(ch.school_id) || { school_id: ch.school_id, school_name: ch.school_name, outstanding: 0, credit: 0 };
    row.outstanding += ch.outstanding;
    row.credit += ch.credit;
    bySchool.set(ch.school_id, row);
  }
  const schools = [...bySchool.values()];
  const totalOutstanding = schools.reduce((sum, sc) => sum + sc.outstanding, 0);
  return json({ children: cards, schools, totalOutstanding });
});

records.get('/portal/children/:id', requireRoles('parent'), async (c) => {
  const auth = c.get('auth');
  const studentId = c.req.param('id');
  const link = await c.env.DB.prepare('SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ?')
    .bind(auth.parent?.id, studentId)
    .first();
  if (!link) return bad('Forbidden', 403);
  const student = await c.env.DB.prepare('SELECT s.*, sc.name AS school_name, sc.bank_name, sc.bank_account, sc.payment_instructions_bm, sc.payment_instructions_en FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.id = ?')
    .bind(studentId)
    .first();
  const invoices = await c.env.DB.prepare('SELECT * FROM invoices WHERE student_id = ? ORDER BY issue_date DESC')
    .bind(studentId)
    .all();
  const payments = await c.env.DB.prepare(
    `SELECT p.*, r.number AS receipt_number, r.id AS receipt_id FROM payments p LEFT JOIN receipts r ON r.id = p.receipt_id
     WHERE p.student_id = ? ORDER BY p.paid_at DESC`,
  )
    .bind(studentId)
    .all();
  const balance = await studentBalance(c.env, studentId);
  await auditView(c, 'student_portal', studentId, student.full_name);
  return json({ student: stripIc(student), invoices: invoices.results, payments: payments.results, balance });
});

records.get('/portal/applications', requireRoles('parent'), async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.reference, a.student_name, a.status, a.offer_status, a.offer_deadline, a.submitted_at, s.name AS school_name
     FROM applications a JOIN schools s ON s.id = a.school_id
     WHERE lower(a.parent_email) = lower(?) ORDER BY a.submitted_at DESC`,
  )
    .bind(auth.user.email)
    .all();
  return json({ applications: results });
});

records.get('/portal/receipts/:id/pdf', requireRoles('parent'), async (c) => {
  const auth = c.get('auth');
  const receipt = await c.env.DB.prepare(
    `SELECT r.* FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN parent_students ps ON ps.student_id = p.student_id
     WHERE r.id = ? AND ps.parent_id = ?`,
  )
    .bind(c.req.param('id'), auth.parent?.id || '')
    .first();
  if (!receipt) return bad('Resit tidak dijumpai. / Receipt not found.', 404);
  const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(receipt.payment_id).first();
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(payment.student_id).first();
  const school = await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(receipt.school_id).first();
  const allocations = await c.env.DB.prepare(
    `SELECT pa.amount_cents, i.number, i.type, i.period, i.due_date FROM payment_allocations pa
     JOIN invoices i ON i.id = pa.invoice_id WHERE pa.payment_id = ?`,
  )
    .bind(payment.id)
    .all();
  await auditView(c, 'receipt_portal', receipt.id, receipt.number);
  const bytes = buildReceiptPdf({
    school,
    receipt,
    payment,
    student,
    parent: auth.parent,
    allocations: allocations.results,
    cancelled: receipt.status === 'cancelled',
  });
  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${receipt.number.replace(/\//g, '-')}.pdf"`,
      'cache-control': 'no-store',
    },
  });
});

records.patch('/portal/contact', requireRoles('parent'), async (c) => {
  const auth = c.get('auth');
  if (!auth.parent) return bad('Profil ibu bapa tidak dijumpai. / Parent profile not found.', 404);
  const body = await readJson(c);
  const updates = {};
  for (const f of ['phone', 'address', 'email']) if (body[f] !== undefined && body[f] !== '') updates[f] = String(body[f]).trim().slice(0, f === 'address' ? 500 : 160);
  if (!Object.keys(updates).length) return bad('Tiada perubahan. / Nothing to update.');
  if (updates.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) return bad('E-mel tidak sah. / Invalid email.');
    const taken = await c.env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').bind(updates.email, auth.user.id).first();
    if (taken) return bad('E-mel sudah digunakan. / Email already in use.', 409);
  }
  const fields = { ...updates };
  if (updates.phone !== undefined) fields.phone_norm = normalizePhone(updates.phone);
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const stmts = [c.env.DB.prepare(`UPDATE parents SET ${sets}, updated_at = ? WHERE id = ?`).bind(...Object.values(fields), nowIso(), auth.parent.id)];
  if (updates.email) stmts.push(c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(updates.email, auth.user.id));
  await c.env.DB.batch(stmts);
  await audit(c, 'update', 'parent_contact', auth.parent.id, { before: { phone: auth.parent.phone, email: auth.parent.email, address: auth.parent.address }, after: updates });
  return json({ ok: true });
});

export default records;
