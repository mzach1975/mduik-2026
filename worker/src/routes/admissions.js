import { Hono } from 'hono';
import { authMiddleware, requireRoles, encryptIc, hashIc } from '../lib/auth.js';
import { id, nowIso, today, readJson, bad, json, yearOf, daysBetween, pageParams, pagingMeta } from '../lib/util.js';
import { audit, auditView } from '../lib/audit.js';
import { notify, notifyRoles, notifyParentsOfStudent, subjectFor } from '../lib/notify.js';
import { createInvoice, dueDateFor, studentBalance } from '../lib/finance.js';

const admissions = new Hono();
admissions.use('*', authMiddleware);

export const RUBRIC = {
  sections: [
    {
      id: 1,
      bm: 'Bacaan Qur’an / Iqra’',
      en: 'Qur’an reading / Iqra’',
      max: 25,
      items: [
        { key: 's1_tajwid', bm: 'Tajwid', en: 'Tajwid', max: 10 },
        { key: 's1_makhraj', bm: 'Makhraj', en: 'Makhraj', max: 10 },
        { key: 's1_fluency', bm: 'Kelancaran / Tartil', en: 'Fluency / Tartil', max: 5 },
      ],
    },
    {
      id: 2,
      bm: 'Tauhid',
      en: 'Tauhid',
      max: 22,
      items: [
        { key: 's2_syahadah', bm: 'Syahadah', en: 'Syahadah', max: 2 },
        { key: 's2_islam', bm: 'Rukun Islam', en: 'Pillars of Islam', max: 10 },
        { key: 's2_iman', bm: 'Rukun Iman', en: 'Pillars of Iman', max: 10 },
      ],
    },
    {
      id: 3,
      bm: 'Fiqh',
      en: 'Fiqh',
      max: 13,
      items: [
        { key: 's3_prayer', bm: 'Nama & bilangan rakaat solat fardhu', en: 'Names & rak’ahs of obligatory prayers', max: 10 },
        { key: 's3_subuh', bm: 'Niat solat Subuh', en: 'Subuh intention', max: 3 },
      ],
    },
    {
      id: 4,
      bm: 'Adab dan doa',
      en: 'Manners and supplications',
      max: 10,
      items: [
        { key: 's4_eating', bm: 'Doa sebelum makan', en: 'Supplication before eating', max: 5 },
        { key: 's4_sleeping', bm: 'Doa sebelum tidur', en: 'Supplication before sleeping', max: 5 },
      ],
    },
    {
      id: 5,
      bm: 'Ujian tulisan: Jawi dan hafazan',
      en: 'Writing test: Jawi and memorisation',
      max: 20,
      items: [
        { key: 's5_read_jawi', bm: 'Membaca Jawi', en: 'Reading Jawi', max: 5 },
        { key: 's5_write_jawi', bm: 'Menulis Jawi', en: 'Writing Jawi', max: 5 },
        { key: 's5_memorise', bm: 'Menghafal & melafazkan ayat', en: 'Memorising and reciting verses', max: 10 },
      ],
    },
    {
      id: 6,
      bm: 'Hafazan',
      en: 'Hafazan',
      max: 10,
      items: [{ key: 's6_hafazan', bm: 'Hafazan (masa: Baik <5 min / Sederhana <10 min / Lemah >10 min)', en: 'Hafazan (time: Good <5 min / Fair <10 min / Weak >10 min)', max: 10 }],
    },
  ],
  checklist: [
    { id: 7, bm: 'Perkara untuk dibaca dan difahami', en: 'Items to be read and understood' },
    { id: 8, bm: 'Individu', en: 'Individual' },
  ],
  passMark: 40,
};

const ITEM_LIMITS = Object.fromEntries(RUBRIC.sections.flatMap((s) => s.items.map((i) => [i.key, i.max])));

function computeTotal(marks) {
  let total = 0;
  for (const [key, max] of Object.entries(ITEM_LIMITS)) {
    const v = Number(marks[key] ?? 0);
    if (!Number.isFinite(v) || v < 0) throw new Error(`Markah tidak sah untuk ${key}. / Invalid mark for ${key}.`);
    if (v > max) throw new Error(`Markah ${key} melebihi maksimum ${max}. / Mark for ${key} exceeds maximum ${max}.`);
    total += v;
  }
  return Math.round(total * 100) / 100;
}

admissions.get('/rubric', (c) => json({ rubric: RUBRIC }));

admissions.get('/applications', async (c) => {
  const auth = c.get('auth');
  const { page, pageSize, offset } = pageParams(c);
  const schoolId = c.req.query('schoolId') && auth.isSuper ? c.req.query('schoolId') : auth.activeSchool;
  const where = [];
  const binds = [];
  if (schoolId) {
    where.push('a.school_id = ?');
    binds.push(schoolId);
  }
  const status = c.req.query('status');
  if (status) {
    where.push('a.status = ?');
    binds.push(status);
  }
  const q = c.req.query('q');
  if (q) {
    where.push('(a.student_name LIKE ? OR a.reference LIKE ? OR a.parent_name LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (c.req.query('category')) {
    where.push('a.category = ?');
    binds.push(c.req.query('category'));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM applications a ${w}`).bind(...binds).first();
  const { results } = await c.env.DB.prepare(
    `SELECT a.*,
       (SELECT AVG(sc.total) FROM scores sc JOIN interviews iv ON iv.id = sc.interview_id WHERE iv.application_id = a.id) AS final_mark,
       (SELECT COUNT(*) FROM scores sc JOIN interviews iv ON iv.id = sc.interview_id WHERE iv.application_id = a.id) AS score_count,
       (SELECT iv.scheduled_at FROM interviews iv WHERE iv.application_id = a.id ORDER BY iv.scheduled_at DESC LIMIT 1) AS interview_at,
       (SELECT d.decision FROM decisions d WHERE d.application_id = a.id ORDER BY d.decided_at DESC LIMIT 1) AS decision
     FROM applications a ${w} ORDER BY a.submitted_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return json({ applications: results, ...pagingMeta(count?.n || 0, page, pageSize) });
});

admissions.get('/applications/stats', async (c) => {
  const auth = c.get('auth');
  const schoolId = c.req.query('schoolId') && auth.isSuper ? c.req.query('schoolId') : auth.activeSchool;
  const { results } = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM applications WHERE school_id = ? GROUP BY status`,
  )
    .bind(schoolId)
    .all();
  const byStatus = Object.fromEntries(results.map((r) => [r.status, r.n]));
  const total = results.reduce((s, r) => s + r.n, 0);
  return json({ byStatus, total });
});

admissions.get('/applications/:id', async (c) => {
  const auth = c.get('auth');
  const appId = c.req.param('id');
  const app = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(appId).first();
  if (!app) return bad('Permohonan tidak dijumpai. / Application not found.', 404);
  if (!auth.isSuper && app.school_id !== auth.activeSchool) return bad('Forbidden', 403);
  const interviews = await c.env.DB.prepare(
    'SELECT * FROM interviews WHERE application_id = ? ORDER BY scheduled_at DESC',
  )
    .bind(appId)
    .all();
  const scores = await c.env.DB.prepare(
    `SELECT sc.*, u.full_name AS assessor_name FROM scores sc JOIN users u ON u.id = sc.assessor_id
     JOIN interviews iv ON iv.id = sc.interview_id WHERE iv.application_id = ? ORDER BY sc.submitted_at`,
  )
    .bind(appId)
    .all();
  for (const iv of interviews.results) {
    const assessors = await c.env.DB.prepare(
      `SELECT ia.assessor_id, u.full_name FROM interview_assessors ia JOIN users u ON u.id = ia.assessor_id WHERE ia.interview_id = ?`,
    )
      .bind(iv.id)
      .all();
    iv.assessors = assessors.results;
    iv.scores = scores.results.filter((s) => s.interview_id === iv.id);
  }
  const decision = await c.env.DB.prepare('SELECT * FROM decisions WHERE application_id = ? ORDER BY decided_at DESC LIMIT 1')
    .bind(appId)
    .first();
  const avg = scores.results.length
    ? Math.round((scores.results.reduce((s, r) => s + r.total, 0) / scores.results.length) * 100) / 100
    : null;
  await auditView(c, 'application', appId, app.reference);
  return json({ application: app, interviews: interviews.results, decision, finalMark: avg, passMark: RUBRIC.passMark, belowPass: avg !== null && avg < RUBRIC.passMark });
});

admissions.post('/applications/:id/schedule', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const appId = c.req.param('id');
  const app = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ? AND school_id = ?')
    .bind(appId, auth.activeSchool)
    .first();
  if (!app) return bad('Not found', 404);
  const body = await readJson(c);
  if (!body.scheduledAt) return bad('Tarikh temuduga diperlukan. / Interview date is required.');
  const interviewId = id('itv');
  await c.env.DB.prepare(
    'INSERT INTO interviews (id, school_id, application_id, scheduled_at, mode, location, status, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      interviewId,
      auth.activeSchool,
      appId,
      body.scheduledAt,
      body.mode || 'in_person',
      body.location || '',
      'scheduled',
      body.notes || '',
      auth.user.id,
      nowIso(),
    )
    .run();
  const assessors = Array.isArray(body.assessorIds) ? body.assessorIds.slice(0, 2) : [];
  for (const assessorId of assessors) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO interview_assessors (id, interview_id, assessor_id) VALUES (?,?,?)')
      .bind(id('iva'), interviewId, assessorId)
      .run();
  }
  await c.env.DB.prepare("UPDATE applications SET status = 'interview' WHERE id = ? AND status IN ('submitted','incomplete')")
    .bind(appId)
    .run();
  const when = String(body.scheduledAt).replace('T', ' ');
  await notify(c.env, {
    schoolId: auth.activeSchool,
    email: app.email,
    name: app.parent_name || app.student_name,
    type: 'interview_scheduled',
    subject: subjectFor('interview_scheduled', app.language) + ` — ${app.reference}`,
    body:
      app.language === 'en'
        ? `Your interview for application ${app.reference} is scheduled on ${when}. Location: ${body.location || 'School office'}.`
        : `Temuduga untuk permohonan ${app.reference} dijadualkan pada ${when}. Lokasi: ${body.location || 'Pejabat sekolah'}.`,
    language: app.language,
  });
  for (const assessorId of assessors) {
    const teacher = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(assessorId).first();
    if (teacher) {
      await notify(c.env, {
        schoolId: auth.activeSchool,
        userId: teacher.id,
        email: teacher.email,
        name: teacher.full_name,
        type: 'interview_assigned',
        subject: `Temuduga ditugaskan / Interview assigned — ${app.student_name}`,
        body: `Anda ditugaskan untuk menilai temuduga ${app.student_name} (${app.reference}) pada ${when}.\nYou are assigned to assess the interview of ${app.student_name} (${app.reference}) on ${when}.`,
        language: teacher.language,
      });
    }
  }
  await audit(c, 'schedule', 'interview', interviewId, { after: { appId, scheduledAt: body.scheduledAt, assessors } });
  return json({ id: interviewId }, 201);
});

admissions.post('/applications/:id/decision', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const appId = c.req.param('id');
  const app = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ? AND school_id = ?')
    .bind(appId, auth.activeSchool)
    .first();
  if (!app) return bad('Not found', 404);
  const body = await readJson(c);
  if (!['accepted', 'not_accepted', 'waiting_list'].includes(body.decision)) return bad('Keputusan tidak sah. / Invalid decision.');
  if (!body.reason || String(body.reason).trim().length < 3) return bad('Sebab keputusan diperlukan. / A reason is required.');
  const decisionId = id('dec');
  await c.env.DB.prepare(
    'INSERT INTO decisions (id, school_id, application_id, decision, reason, decided_by, decided_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(decisionId, auth.activeSchool, appId, body.decision, body.reason, auth.user.id, nowIso())
    .run();
  await c.env.DB.prepare('UPDATE applications SET status = ?, offer_status = NULL WHERE id = ?')
    .bind(body.decision, appId)
    .run();
  await notify(c.env, {
    schoolId: auth.activeSchool,
    email: app.email,
    name: app.parent_name || app.student_name,
    type: 'decision',
    subject: subjectFor('decision', app.language) + ` — ${app.reference}`,
    body:
      app.language === 'en'
        ? `A decision has been recorded for application ${app.reference}: ${body.decision.replace('_', ' ')}. Reason: ${body.reason}.`
        : `Keputusan telah direkodkan untuk permohonan ${app.reference}: ${body.decision === 'accepted' ? 'Diterima' : body.decision === 'not_accepted' ? 'Tidak diterima' : 'Senarai menunggu'}. Sebab: ${body.reason}.`,
    language: app.language,
  });
  await audit(c, 'decide', 'application', appId, { after: { decision: body.decision, reason: body.reason } });
  return json({ ok: true, id: decisionId }, 201);
});

admissions.post('/applications/:id/offer', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const appId = c.req.param('id');
  const app = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ? AND school_id = ?')
    .bind(appId, auth.activeSchool)
    .first();
  if (!app) return bad('Not found', 404);
  if (app.status !== 'waiting_list') return bad('Tawaran hanya untuk senarai menunggu. / Offers apply to waiting-list applicants only.');
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await c.env.DB.prepare("UPDATE applications SET offer_status = 'offered', offer_deadline = ? WHERE id = ?")
    .bind(deadline, appId)
    .run();
  await notify(c.env, {
    schoolId: auth.activeSchool,
    email: app.email,
    name: app.parent_name || app.student_name,
    type: 'waiting_offer',
    subject: subjectFor('waiting_offer', app.language) + ` — ${app.reference}`,
    body:
      app.language === 'en'
        ? `A place is offered to ${app.student_name}. Please respond by ${deadline} (7 calendar days). If we do not hear from you, the offer will lapse.`
        : `Tawaran tempat untuk ${app.student_name}. Sila jawab sebelum ${deadline} (7 hari kalendar). Jika tiada jawapan, tawaran akan luput.`,
    language: app.language,
  });
  await audit(c, 'offer', 'application', appId, { after: { deadline } });
  return json({ ok: true, deadline });
});

admissions.post('/applications/:id/offer-response', async (c) => {
  const auth = c.get('auth');
  const appId = c.req.param('id');
  const app = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(appId).first();
  if (!app) return bad('Not found', 404);
  const isParent = auth.roleInSchool === 'parent' && auth.user.email && app.parent_email && auth.user.email.toLowerCase() === app.parent_email.toLowerCase();
  if (!auth.isSuper && auth.roleInSchool !== 'school_admin' && !isParent) return bad('Forbidden', 403);
  const body = await readJson(c);
  if (!['accepted', 'declined'].includes(body.response)) return bad('Respons tidak sah. / Invalid response.');
  if (app.offer_status !== 'offered') return bad('Tiada tawaran aktif. / No active offer.');
  const lapsed = app.offer_deadline && app.offer_deadline < today();
  if (lapsed && !auth.isSuper && auth.roleInSchool !== 'school_admin') return bad('Tawaran telah luput. / The offer has lapsed.');
  const newStatus = body.response === 'accepted' ? 'accepted' : 'waiting_list';
  await c.env.DB.prepare('UPDATE applications SET status = ?, offer_status = ? WHERE id = ?')
    .bind(newStatus, body.response === 'accepted' ? 'accepted' : 'declined', appId)
    .run();
  await notifyRoles(c.env, app.school_id, ['school_admin'], {
    type: 'offer_response',
    subject: `Jawapan tawaran / Offer response — ${app.reference}`,
    body: `Pemohon ${app.student_name} telah ${body.response === 'accepted' ? 'menerima' : 'menolak'} tawaran.\nApplicant ${app.student_name} has ${body.response === 'accepted' ? 'accepted' : 'declined'} the offer.`,
    language: 'bm',
  });
  await audit(c, 'offer_response', 'application', appId, { after: { response: body.response } });
  return json({ ok: true });
});

admissions.post('/applications/:id/register', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const appId = c.req.param('id');
  const app = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ? AND school_id = ?')
    .bind(appId, auth.activeSchool)
    .first();
  if (!app) return bad('Not found', 404);
  if (app.status !== 'accepted') return bad('Hanya pemohon diterima boleh didaftarkan. / Only accepted applicants can be registered.');
  if (app.status === 'registered') return bad('Sudah didaftarkan. / Already registered.', 409);
  const body = await readJson(c);
  const school = auth.school;
  const plan = await c.env.DB.prepare('SELECT * FROM fee_plans WHERE school_id = ? AND active = 1 ORDER BY created_at LIMIT 1')
    .bind(auth.activeSchool)
    .first();

  const existing = app.ic_hash
    ? await c.env.DB.prepare('SELECT * FROM students WHERE ic_hash = ? AND school_id = ?').bind(app.ic_hash, auth.activeSchool).first()
    : null;

  // FR-FIN-26: arrears notice on re-registration (never blocks).
  let arrearsWarning = null;
  if (existing) {
    const bal = await studentBalance(c.env, existing.id);
    if (bal.outstanding > 0) {
      arrearsWarning = { studentId: existing.id, outstanding: bal.outstanding };
      await notifyRoles(c.env, auth.activeSchool, ['school_admin', 'bursar'], {
        type: 'arrears_registration',
        subject: `Pendaftaran dengan tunggakan / Registration with arrears — ${existing.full_name}`,
        body: `${existing.full_name} didaftarkan semula dengan tunggakan RM ${(bal.outstanding / 100).toFixed(2)}. Pendaftaran tidak disekat.\n${existing.full_name} is being registered again with arrears of RM ${(bal.outstanding / 100).toFixed(2)}. Registration is not blocked.`,
        language: 'bm',
      });
    }
  }

  const studentId = existing?.id || id('std');
  if (!existing) {
    const fee = Number(body.monthlyFeeCents ?? plan?.monthly_fee_cents ?? school.monthly_fee_cents);
    await c.env.DB.prepare(
      `INSERT INTO students (id, school_id, full_name, ic_hash, ic_enc, ic_masked, dob, gender, class_name, address,
        phone, email, fee_plan_id, monthly_fee_cents, monthly_tracking, status, application_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'active',?,?)`,
    )
      .bind(
        studentId,
        auth.activeSchool,
        body.fullName || app.student_name,
        app.ic_hash,
        app.ic_enc,
        app.ic_masked,
        body.dob || app.dob || null,
        body.gender || app.gender || null,
        body.className || '',
        body.address || app.address || '',
        body.phone || app.phone || '',
        body.email || app.email || '',
        plan?.id || null,
        fee,
        appId,
        nowIso(),
      )
      .run();
  } else {
    await c.env.DB.prepare("UPDATE students SET status = 'active', class_name = COALESCE(NULLIF(?,''), class_name) WHERE id = ?")
      .bind(body.className || '', studentId)
      .run();
  }

  let parent = body.parentEmail || app.parent_email
    ? await c.env.DB.prepare('SELECT * FROM parents WHERE lower(email) = lower(?)')
        .bind(body.parentEmail || app.parent_email)
        .first()
    : null;
  if (!parent) {
    const parentId = id('par');
    await c.env.DB.prepare(
      'INSERT INTO parents (id, full_name, email, phone, ic_masked, address, created_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind(
        parentId,
        body.parentName || app.parent_name || '',
        body.parentEmail || app.parent_email || '',
        body.parentPhone || app.parent_phone || '',
        null,
        body.address || app.address || '',
        nowIso(),
      )
      .run();
    parent = { id: parentId };
  }
  await c.env.DB.prepare("INSERT OR IGNORE INTO parent_students (id, parent_id, student_id, relationship) VALUES (?,?,?,'guardian')")
    .bind(id('ps'), parent.id, studentId)
    .run();

  const year = yearOf(today());
  const dueDate = dueDateFor(year, school.reg_due_month, school.reg_due_day);
  const regAmount = plan?.registration_fee_cents ?? school.registration_fee_cents;
  const { invoice } = await createInvoice(c.env, {
    schoolId: auth.activeSchool,
    studentId,
    type: 'registration',
    period: String(year),
    issueDate: today(),
    dueDate,
    amountCents: regAmount,
    description: `Yuran pendaftaran ${year} / Registration fee ${year}`,
  });

  await c.env.DB.prepare("UPDATE applications SET status = 'registered' WHERE id = ?").bind(appId).run();
  await audit(c, 'register', 'student', studentId, { after: { applicationId: appId, invoice: invoice.number } });
  return json({ studentId, invoice, parentId: parent.id, arrearsWarning }, 201);
});

admissions.get('/interviews', async (c) => {
  const auth = c.get('auth');
  const mine = c.req.query('mine') === '1' || auth.roleInSchool === 'teacher';
  let sql = `SELECT iv.*, a.reference, a.student_name, a.category, a.status AS application_status,
      (SELECT COUNT(*) FROM scores sc WHERE sc.interview_id = iv.id) AS score_count,
      (SELECT AVG(sc.total) FROM scores sc WHERE sc.interview_id = iv.id) AS final_mark
    FROM interviews iv JOIN applications a ON a.id = iv.application_id
    WHERE iv.school_id = ?`;
  const binds = [auth.activeSchool];
  if (mine) {
    sql += ' AND (iv.id IN (SELECT interview_id FROM interview_assessors WHERE assessor_id = ?) OR iv.created_by = ?)';
    binds.push(auth.user.id, auth.user.id);
  }
  sql += ' ORDER BY iv.scheduled_at DESC LIMIT 200';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return json({ interviews: results });
});

admissions.get('/interviews/:id', async (c) => {
  const auth = c.get('auth');
  const interviewId = c.req.param('id');
  const interview = await c.env.DB.prepare(
    `SELECT iv.*, a.reference, a.student_name, a.category, a.parent_name, a.dob FROM interviews iv
     JOIN applications a ON a.id = iv.application_id WHERE iv.id = ? AND iv.school_id = ?`,
  )
    .bind(interviewId, auth.activeSchool)
    .first();
  if (!interview) return bad('Not found', 404);
  if (auth.roleInSchool === 'teacher') {
    const assigned = await c.env.DB.prepare('SELECT 1 FROM interview_assessors WHERE interview_id = ? AND assessor_id = ?')
      .bind(interviewId, auth.user.id)
      .first();
    if (!assigned) return bad('Anda tidak ditugaskan untuk temuduga ini. / You are not assigned to this interview.', 403);
  }
  const assessors = await c.env.DB.prepare(
    'SELECT ia.assessor_id, u.full_name FROM interview_assessors ia JOIN users u ON u.id = ia.assessor_id WHERE ia.interview_id = ?',
  )
    .bind(interviewId)
    .all();
  const scores = await c.env.DB.prepare(
    'SELECT sc.*, u.full_name AS assessor_name FROM scores sc JOIN users u ON u.id = sc.assessor_id WHERE sc.interview_id = ?',
  )
    .bind(interviewId)
    .all();
  const myScore = scores.results.find((s) => s.assessor_id === auth.user.id) || null;
  const finalMark = scores.results.length
    ? Math.round((scores.results.reduce((s, r) => s + r.total, 0) / scores.results.length) * 100) / 100
    : null;
  await auditView(c, 'interview', interviewId, interview.reference);
  return json({
    interview,
    assessors: assessors.results,
    scores: scores.results,
    myScore,
    finalMark,
    rubric: RUBRIC,
    belowPass: finalMark !== null && finalMark < RUBRIC.passMark,
  });
});

admissions.post('/interviews/:id/score', requireRoles('teacher', 'school_admin'), async (c) => {
  const auth = c.get('auth');
  const interviewId = c.req.param('id');
  const interview = await c.env.DB.prepare('SELECT * FROM interviews WHERE id = ? AND school_id = ?')
    .bind(interviewId, auth.activeSchool)
    .first();
  if (!interview) return bad('Not found', 404);
  const assigned = await c.env.DB.prepare('SELECT 1 FROM interview_assessors WHERE interview_id = ? AND assessor_id = ?')
    .bind(interviewId, auth.user.id)
    .first();
  if (!assigned) return bad('Anda tidak ditugaskan untuk temuduga ini. / You are not assigned to this interview.', 403);
  const body = await readJson(c);
  let total;
  try {
    total = computeTotal(body.marks || {});
  } catch (err) {
    return bad(err.message);
  }
  const marks = {};
  for (const key of Object.keys(ITEM_LIMITS)) marks[key] = Number(body.marks?.[key] ?? 0);
  if (body.s6_time) marks.s6_time = String(body.s6_time).slice(0, 20);
  if (body.checklist) marks.checklist = body.checklist;
  const existing = await c.env.DB.prepare('SELECT * FROM scores WHERE interview_id = ? AND assessor_id = ?')
    .bind(interviewId, auth.user.id)
    .first();
  if (existing) {
    await c.env.DB.prepare('UPDATE scores SET marks = ?, total = ?, submitted_at = ? WHERE id = ?')
      .bind(JSON.stringify(marks), total, nowIso(), existing.id)
      .run();
  } else {
    await c.env.DB.prepare('INSERT INTO scores (id, interview_id, assessor_id, marks, total, submitted_at) VALUES (?,?,?,?,?,?)')
      .bind(id('scr'), interviewId, auth.user.id, JSON.stringify(marks), total, nowIso())
      .run();
  }
  const { results: allScores } = await c.env.DB.prepare('SELECT total FROM scores WHERE interview_id = ?')
    .bind(interviewId)
    .all();
  const finalMark = allScores.length ? Math.round((allScores.reduce((s, r) => s + r.total, 0) / allScores.length) * 100) / 100 : total;
  if (allScores.length >= 2) {
    await c.env.DB.prepare("UPDATE interviews SET status = 'completed' WHERE id = ?").bind(interviewId).run();
    if (finalMark < RUBRIC.passMark) {
      await notifyRoles(c.env, auth.activeSchool, ['school_admin'], {
        type: 'below_pass_mark',
        subject: `Calon bawah markah lulus / Applicant below pass mark — ${finalMark}`,
        body: `Markah akhir ${finalMark}/100 berada di bawah markah lulus 40. Jawatankuasa perlu menimbang.\nFinal mark ${finalMark}/100 is below the pass mark of 40. Committee review required.`,
        language: 'bm',
      });
    }
  }
  await audit(c, 'score', 'interview', interviewId, { after: { total, assessor: auth.user.id } });
  return json({ ok: true, total, finalMark, passMark: RUBRIC.passMark, belowPass: finalMark < RUBRIC.passMark });
});

export default admissions;
