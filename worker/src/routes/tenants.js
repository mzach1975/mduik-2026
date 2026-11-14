import { Hono } from 'hono';
import { authMiddleware, requireRoles, hashPassword, encryptIc, hashIc, publicUser, revokeAllSessions } from '../lib/auth.js';
import { id, nowIso, readJson, bad, json, slugify, pick, normalizeIc } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';
import { registerParent } from '../lib/parents.js';
import { registerTeacher } from '../lib/teachers.js';
import { message, EMAIL_RE } from '../lib/people.js';

const tenants = new Hono();
tenants.use('*', authMiddleware);

const SCHOOL_FIELDS = [
  'name',
  'short_name',
  'category',
  'state',
  'address',
  'phone',
  'email',
  'logo_url',
  'monthly_due_day',
  'reg_gen_month',
  'reg_gen_day',
  'reg_due_month',
  'reg_due_day',
  'monthly_fee_cents',
  'registration_fee_cents',
  'bank_name',
  'bank_account',
  'payment_instructions_bm',
  'payment_instructions_en',
  'invoice_prefix',
  'receipt_prefix',
  'status',
];

const FEE_REQUIRED =
  'Yuran bulanan lalai dan yuran pendaftaran diperlukan (RM, dua tempat perpuluhan). / Default monthly fee and registration fee amount are required (RM, two decimals).';

/** Fields a School Admin may change in the school profile (CR-PR 2026-11-14 CR-3); fees, schedule and payment details stay editable. */
const ADMIN_LOCKED = ['name', 'short_name', 'category', 'state', 'status', 'slug'];

/** Whole number in [min, max], else null. */
function intIn(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Validates school schedule and contact values; returns a bilingual message or null. */
function schoolProblem(v) {
  if (v.monthly_due_day !== undefined && intIn(v.monthly_due_day, 1, 28) === null) {
    return 'Hari akhir bayaran bulanan mesti antara 1 dan 28. / Monthly due day must be between 1 and 28.';
  }
  for (const k of ['reg_gen_month', 'reg_due_month']) {
    if (v[k] !== undefined && intIn(v[k], 1, 12) === null) return 'Bulan mesti antara 1 dan 12. / Month must be between 1 and 12.';
  }
  for (const k of ['reg_gen_day', 'reg_due_day']) {
    if (v[k] !== undefined && intIn(v[k], 1, 31) === null) return 'Hari mesti antara 1 dan 31. / Day must be between 1 and 31.';
  }
  if (v.email && !EMAIL_RE.test(String(v.email).trim())) return 'E-mel sekolah tidak sah. / School email is invalid.';
  return null;
}

/** A required fee in sen: a whole number from 0 to RM 1,000,000.00, else null. */
function feeCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100000000 ? n : null;
}

tenants.get('/schools', async (c) => {
  const auth = c.get('auth');
  if (auth.isSuper) {
    const { results } = await c.env.DB.prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS students,
        (SELECT COUNT(*) FROM teacher_schools tm WHERE tm.school_id = s.id AND tm.status = 'active') AS teachers,
        (SELECT COUNT(*) FROM applications a WHERE a.school_id = s.id) AS applications
       FROM schools s ORDER BY s.name`,
    ).all();
    return json({ schools: results });
  }
  const ids = auth.roles.map((r) => r.school_id).filter(Boolean);
  if (!ids.length) return json({ schools: [] });
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT * FROM schools WHERE id IN (${placeholders}) ORDER BY name`)
    .bind(...ids)
    .all();
  return json({ schools: results });
});

tenants.post('/schools', requireRoles('super_admin'), async (c) => {
  const body = await readJson(c);
  body.name = String(body.name || '').trim();
  if (!body.name || !body.category) return bad('Nama dan kategori sekolah diperlukan. / School name and category are required.');
  if (!['tahfiz', 'islamic_studies'].includes(body.category)) return bad('Kategori tidak sah. / Invalid category.');
  if (!body.adminEmail || !String(body.adminName || '').trim()) return bad('Nama dan e-mel Pentadbir Sekolah diperlukan. / School Admin name and email are required.');
  body.adminEmail = String(body.adminEmail).trim().toLowerCase();
  if (!EMAIL_RE.test(body.adminEmail)) return bad('E-mel Pentadbir Sekolah tidak sah. / School Admin email is invalid.', 400, { code: 'email_invalid' });
  if (body.adminPassword && String(body.adminPassword).length < 8) {
    return bad('Kata laluan Pentadbir Sekolah mestilah sekurang-kurangnya 8 aksara. / School Admin password must be at least 8 characters.', 400, { code: 'password_rule' });
  }
  const schedule = {
    monthly_due_day: body.monthlyDueDay ?? 7,
    reg_gen_month: body.regGenMonth ?? 1,
    reg_gen_day: body.regGenDay ?? 1,
    reg_due_month: body.regDueMonth ?? 1,
    reg_due_day: body.regDueDay ?? 31,
    email: body.email,
  };
  const problem = schoolProblem(schedule);
  if (problem) return bad(problem, 400, { code: 'invalid_school' });
  const sameName = await c.env.DB.prepare('SELECT id FROM schools WHERE lower(name) = lower(?)').bind(body.name).first();
  if (sameName) return bad('Sekolah dengan nama ini sudah wujud. / A school with this name already exists.', 409, { code: 'school_exists' });
  const monthlyFee = feeCents(body.monthlyFeeCents);
  const registrationFee = feeCents(body.registrationFeeCents);
  if (monthlyFee === null || registrationFee === null) return bad(FEE_REQUIRED, 400, { code: 'fees_required' });
  const schoolId = id('sch');
  const now = nowIso();
  const baseSlug = slugify(body.name);
  let slug = baseSlug;
  let n = 1;
  while (await c.env.DB.prepare('SELECT id FROM schools WHERE slug = ?').bind(slug).first()) slug = `${baseSlug}-${++n}`;
  await c.env.DB.prepare(
    `INSERT INTO schools (id, name, short_name, slug, category, state, address, phone, email, logo_url,
      monthly_due_day, reg_gen_month, reg_gen_day, reg_due_month, reg_due_day,
      monthly_fee_cents, registration_fee_cents, bank_name, bank_account,
      payment_instructions_bm, payment_instructions_en, invoice_prefix, receipt_prefix, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      schoolId,
      body.name,
      body.shortName || body.name,
      slug,
      body.category,
      body.state || '',
      body.address || '',
      body.phone || '',
      body.email || '',
      body.logoUrl || '',
      Number(schedule.monthly_due_day),
      Number(schedule.reg_gen_month),
      Number(schedule.reg_gen_day),
      Number(schedule.reg_due_month),
      Number(schedule.reg_due_day),
      monthlyFee,
      registrationFee,
      body.bankName || '',
      body.bankAccount || '',
      body.paymentInstructionsBm || 'Sila buat pindahan bank ke akaun sekolah dan muat naik bukti pembayaran di portal.',
      body.paymentInstructionsEn || 'Please bank transfer to the school account and upload proof of payment in the portal.',
      body.invoicePrefix || 'INV',
      body.receiptPrefix || 'RCP',
      'active',
      now,
    )
    .run();
  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(body.adminEmail).first();
  let adminUser = existing;
  if (!existing) {
    const userId = id('usr');
    const pwd = await hashPassword(body.adminPassword || 'Mduik@2026');
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, full_name, phone, password_hash, language, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
      .bind(userId, body.adminEmail, body.adminName, body.adminPhone || '', pwd, 'bm', 'active', now)
      .run();
    adminUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    await notify(c.env, {
      schoolId,
      userId,
      email: adminUser.email,
      name: adminUser.full_name,
      type: 'account_created',
      subject: 'Akaun Pentadbir Sekolah / School Admin account',
      body: `Akaun anda untuk ${body.name} telah dicipta. Log masuk di ${c.env.APP_URL || new URL(c.req.url).origin}.\nYour account for ${body.name} has been created. Sign in at ${c.env.APP_URL || new URL(c.req.url).origin}.`,
      language: 'bm',
    });
  }
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,?,?,'active')",
  )
    .bind(id('url'), adminUser.id, schoolId, 'school_admin', now)
    .run();
  await audit(c, 'create', 'school', schoolId, {
    after: { name: body.name, category: body.category, monthly_fee_cents: monthlyFee, registration_fee_cents: registrationFee },
  });
  return json({ school: await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(schoolId).first() }, 201);
});

tenants.patch('/schools/:id', async (c) => {
  const auth = c.get('auth');
  const idParam = c.req.param('id');
  if (!auth.isSuper && auth.roleInSchool !== 'school_admin') return bad('Forbidden', 403);
  if (!auth.isSuper && auth.activeSchool !== idParam) return bad('Forbidden', 403);
  if (!auth.isSuper && auth.roleInSchool !== 'school_admin') return bad('Forbidden', 403);
  const existing = await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(idParam).first();
  if (!existing) return bad('Sekolah tidak dijumpai. / School not found.', 404);
  const body = await readJson(c);
  const updates = {};
  for (const f of SCHOOL_FIELDS) {
    if (body[f] === undefined) continue;
    if (!auth.isSuper && ADMIN_LOCKED.includes(f)) continue;
    updates[f] = typeof body[f] === 'number' ? body[f] : String(body[f]);
  }
  if (!Object.keys(updates).length) return bad('Tiada perubahan. / Nothing to update.');
  // Fees are required money values; a change applies only to invoices created afterwards.
  for (const f of ['monthly_fee_cents', 'registration_fee_cents']) {
    if (updates[f] === undefined) continue;
    const v = feeCents(updates[f]);
    if (v === null) return bad(FEE_REQUIRED, 400, { code: 'fees_required' });
    updates[f] = v;
  }
  if (updates.name !== undefined) {
    updates.name = updates.name.trim();
    if (!updates.name) return bad('Nama sekolah diperlukan. / School name is required.');
    const clash = await c.env.DB.prepare('SELECT id FROM schools WHERE lower(name) = lower(?) AND id != ?').bind(updates.name, idParam).first();
    if (clash) return bad('Sekolah dengan nama ini sudah wujud. / A school with this name already exists.', 409, { code: 'school_exists' });
  }
  if (updates.category !== undefined && !['tahfiz', 'islamic_studies'].includes(updates.category)) return bad('Kategori tidak sah. / Invalid category.');
  if (updates.status !== undefined && !['active', 'suspended'].includes(updates.status)) return bad('Status tidak sah. / Invalid status.');
  const problem = schoolProblem(updates);
  if (problem) return bad(problem, 400, { code: 'invalid_school' });
  for (const k of ['monthly_due_day', 'reg_gen_month', 'reg_gen_day', 'reg_due_month', 'reg_due_day']) {
    if (updates[k] !== undefined) updates[k] = Number(updates[k]);
  }
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE schools SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...Object.values(updates), nowIso(), idParam)
    .run();
  const after = await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(idParam).first();
  const before = pick(existing, Object.keys(updates));
  await audit(c, 'update', 'school', idParam, { before, after: pick(after, Object.keys(updates)) });
  return json({ school: after });
});

tenants.get('/schools/:id', async (c) => {
  const auth = c.get('auth');
  const idParam = c.req.param('id');
  if (!auth.isSuper && auth.activeSchool !== idParam) return bad('Forbidden', 403);
  const school = await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(idParam).first();
  if (!school) return bad('Not found', 404);
  await audit(c, 'view', 'school', idParam);
  return json({ school });
});

tenants.get('/school-settings', async (c) => {
  const auth = c.get('auth');
  if (!auth.activeSchool) return bad('Tiada konteks sekolah. / No school context.', 400);
  const school = await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(auth.activeSchool).first();
  return json({ school });
});

/* ---------------------------- Users ---------------------------- */
tenants.get('/users', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const q = c.req.query('q');
  // Super admin sees the account status; a school admin sees the status of the
  // user's roles at their own school (deactivation there is per school).
  const statusCol = auth.isSuper
    ? 'u.status'
    : "CASE WHEN u.status != 'active' THEN 'inactive' WHEN SUM(CASE WHEN ur.status = 'active' AND ur.ended_at IS NULL THEN 1 ELSE 0 END) > 0 THEN 'active' ELSE 'inactive' END";
  let sql = `SELECT u.id, u.email, u.full_name, u.phone, u.ic_masked, u.language, ${statusCol} AS status, u.last_login_at, u.created_at,
      GROUP_CONCAT(DISTINCT ur.role) AS roles,
      GROUP_CONCAT(DISTINCT s.name) AS schools
    FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id${auth.isSuper ? " AND ur.status = 'active'" : ''}
    LEFT JOIN schools s ON s.id = ur.school_id`;
  const binds = [];
  const where = [];
  if (!auth.isSuper) {
    where.push('ur.school_id = ?');
    binds.push(auth.activeSchool);
  }
  if (q) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ' GROUP BY u.id ORDER BY u.full_name LIMIT 200';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return json({ users: results });
});

tenants.get('/users/:id', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const userId = c.req.param('id');
  const user = await c.env.DB.prepare(
    'SELECT id, email, full_name, phone, ic_masked, language, status, parent_id, last_login_at, created_at FROM users WHERE id = ?',
  )
    .bind(userId)
    .first();
  if (!user) return bad('Pengguna tidak dijumpai. / User not found.', 404);
  const roles = await c.env.DB.prepare(
    `SELECT ur.id, ur.school_id, ur.role, ur.status, s.name AS school_name
     FROM user_roles ur LEFT JOIN schools s ON s.id = ur.school_id
     WHERE ur.user_id = ? ORDER BY s.name, ur.role`,
  )
    .bind(userId)
    .all();
  if (!auth.isSuper) {
    const allowed = roles.results.some((r) => r.school_id === auth.activeSchool);
    if (!allowed) return bad('Forbidden', 403);
  }
  const children = user.parent_id
    ? await c.env.DB.prepare(
        `SELECT ps.student_id, ps.relationship, s.full_name, sc.name AS school_name FROM parent_students ps JOIN schools sc ON sc.id = ps.school_id
         JOIN students s ON s.id = ps.student_id WHERE ps.parent_id = ? ORDER BY s.full_name`,
      )
        .bind(user.parent_id)
        .all()
    : { results: [] };
  return json({ user, roles: roles.results, children: children.results });
});

tenants.post('/users', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  const role = body.role;
  const allowedRoles = auth.isSuper ? ['school_admin', 'bursar', 'teacher', 'parent'] : ['bursar', 'teacher', 'parent'];
  if (!allowedRoles.includes(role)) return bad('Peranan tidak dibenarkan. / Role not permitted.', 403);
  const schoolId = auth.isSuper ? body.schoolId || auth.activeSchool : auth.activeSchool;
  if (!schoolId) return bad('Sekolah diperlukan. / School is required.');
  if (!(await c.env.DB.prepare('SELECT 1 AS ok FROM schools WHERE id = ?').bind(schoolId).first())) {
    return bad('Sekolah tidak dijumpai. / School not found.', 404);
  }
  if (!body.fullName || !body.email) return bad('Nama dan e-mel diperlukan. / Name and email are required.');
  const studentIds = role === 'parent' && Array.isArray(body.studentIds)
    ? [...new Set(body.studentIds.filter((x) => typeof x === 'string'))]
    : [];
  if (studentIds.length) {
    const found = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND id IN (${studentIds.map(() => '?').join(',')})`,
    )
      .bind(schoolId, ...studentIds)
      .first();
    if ((found?.n || 0) !== studentIds.length) {
      return bad('Pelajar tidak dijumpai di sekolah ini. / One or more students are not in this school.', 400);
    }
  }
  // Parents and teachers follow the shared person rules: IC / Passport No.
  // search, duplicate warning, and a login whose first password is the IC.
  const appUrl = c.env.APP_URL || new URL(c.req.url).origin;
  const person = {
    ic: body.ic,
    name: body.fullName,
    email: body.email,
    phone: body.phone,
    address: body.address,
    createAnyway: body.createAnyway === true,
    duplicateReason: body.duplicateReason,
  };
  if (role === 'teacher') {
    const r = await registerTeacher(c.env, { ...person, teacherId: body.teacherId || null }, { schoolId, appUrl });
    if (r.response) return r.response;
    if (r.login.error) return bad(message(r.login.error, 'teacher'), 409, { code: r.login.error });
    await audit(c, r.created ? 'create' : 'add_membership', 'teacher', r.teacher.id, {
      after: { via: 'user', schoolId, userId: r.login.userId, duplicateReason: r.plan.create?.duplicateReason || null },
    });
    return json({ id: r.login.userId, teacherId: r.teacher.id, linked: !r.created, loginCreated: r.login.created }, 201);
  }
  if (role === 'parent') {
    const r = await registerParent(c.env, { ...person, parentId: body.parentId || null }, { schoolId, appUrl, studentIds });
    if (r.response) return r.response;
    if (r.login.error) return bad(message(r.login.error, 'parent'), 409, { code: r.login.error });
    await audit(c, r.plan.create ? 'create' : 'link', 'parent', r.parent.id, {
      after: { via: 'user', userId: r.login.userId, studentIds, duplicateReason: r.plan.create?.duplicateReason || null, matchedByIc: !!r.plan.matchedByIc },
    });
    return json({ id: r.login.userId, parentId: r.parent.id, linked: !r.plan.create, loginCreated: r.login.created }, 201);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(body.email).first();
  if (existing) return bad('E-mel sudah digunakan. / Email already in use.', 409);
  const ic = body.ic ? await encryptIc(c.env, body.ic) : { enc: null, hash: null, masked: null };
  if (ic.hash && (await c.env.DB.prepare('SELECT 1 AS ok FROM users WHERE ic_hash = ?').bind(ic.hash).first())) {
    return bad('No. IC / Pasport ini sudah mempunyai akaun. / This IC / Passport No. already has an account.', 409);
  }
  const userId = id('usr');
  const password = body.password || 'Mduik@2026';
  if (String(password).length < 8) return bad('Kata laluan mestilah sekurang-kurangnya 8 aksara. / Password must be at least 8 characters.');
  const hash = await hashPassword(password);
  const db = c.env.DB;
  // All rows are written in one batch (a single transaction), so a failure leaves nothing behind.
  const stmts = [
    db.prepare(
      'INSERT INTO users (id, email, full_name, ic_hash, ic_enc, ic_masked, phone, password_hash, language, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(userId, body.email, body.fullName, ic.hash, ic.enc, ic.masked, body.phone || '', hash, body.language || 'bm', 'active', nowIso()),
    db.prepare("INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,?,?,'active')")
      .bind(id('url'), userId, schoolId, role, nowIso()),
  ];
  await db.batch(stmts);
  await notify(c.env, {
    schoolId,
    userId,
    email: body.email,
    name: body.fullName,
    type: 'account_created',
    subject: 'Akaun MDUIK dicipta / MDUIK account created',
    body: `Akaun anda telah dicipta. Log masuk di ${c.env.APP_URL || new URL(c.req.url).origin} dengan e-mel ini.\nYour account has been created. Sign in at ${c.env.APP_URL || new URL(c.req.url).origin} with this email.`,
    language: body.language || 'bm',
  });
  await audit(c, 'create', 'user', userId, { after: { email: body.email, role, schoolId } });
  return json({ id: userId, temporaryPassword: body.password ? undefined : 'Mduik@2026' }, 201);
});

tenants.patch('/users/:id', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const userId = c.req.param('id');
  const body = await readJson(c);
  const target = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!target) return bad('Not found', 404);
  if (!auth.isSuper) {
    const link = await c.env.DB.prepare(
      "SELECT 1 FROM user_roles WHERE user_id = ? AND school_id = ? AND role != 'super_admin'",
    )
      .bind(userId, auth.activeSchool)
      .first();
    if (!link) return bad('Forbidden', 403);
  }
  const updates = {};
  const statusChange = ['active', 'inactive'].includes(body.status) ? body.status : null;
  if (statusChange && !auth.isSuper) {
    const parentRole = await c.env.DB.prepare("SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role = 'parent' LIMIT 1").bind(userId).first();
    if (target.parent_id || parentRole) {
      return bad('Hanya Pentadbir Super boleh menyahaktifkan akaun ibu bapa. / Only the Super Admin can deactivate a parent account.', 403);
    }
  }
  if (statusChange === 'inactive' && userId === auth.user.id) {
    return bad('Anda tidak boleh menyahaktifkan akaun anda sendiri. / You cannot deactivate your own account.');
  }
  // Super admin changes the account itself; a school admin only changes the user's roles at their school.
  if (statusChange && auth.isSuper) updates.status = statusChange;
  if (body.language && ['bm', 'en'].includes(body.language)) updates.language = body.language;
  if (body.fullName) updates.full_name = String(body.fullName).slice(0, 120);
  if (body.phone !== undefined) updates.phone = String(body.phone).slice(0, 40);
  if (body.password) {
    if (String(body.password).length < 8) return bad('Kata laluan terlalu pendek. / Password too short.');
    updates.password_hash = await hashPassword(body.password);
  }
  if (statusChange === 'inactive' && !auth.isSuper) {
    const isAdminHere = await c.env.DB.prepare(
      "SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND school_id = ? AND role = 'school_admin' AND status = 'active' AND ended_at IS NULL",
    )
      .bind(userId, auth.activeSchool)
      .first();
    if (isAdminHere) {
      const others = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id
         WHERE ur.school_id = ? AND ur.role = 'school_admin' AND ur.status = 'active' AND ur.ended_at IS NULL
           AND u.status = 'active' AND ur.user_id != ?`,
      )
        .bind(auth.activeSchool, userId)
        .first();
      if (!others?.n) {
        return bad('Sekolah mesti mempunyai sekurang-kurangnya seorang pentadbir aktif. / The school must keep at least one active admin.');
      }
    }
  }
  if (Object.keys(updates).length) {
    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    await c.env.DB.prepare(`UPDATE users SET ${sets} WHERE id = ?`).bind(...Object.values(updates), userId).run();
  }
  if (statusChange && !auth.isSuper) {
    if (statusChange === 'inactive') {
      await c.env.DB.prepare("UPDATE user_roles SET status = 'inactive', ended_at = ? WHERE user_id = ? AND school_id = ?")
        .bind(nowIso(), userId, auth.activeSchool)
        .run();
    } else {
      await c.env.DB.prepare("UPDATE user_roles SET status = 'active', ended_at = NULL WHERE user_id = ? AND school_id = ? AND role != 'super_admin'")
        .bind(userId, auth.activeSchool)
        .run();
    }
  }
  if (updates.password_hash || updates.status === 'inactive') await revokeAllSessions(c.env, userId);
  if (Array.isArray(body.roles) && auth.isSuper) {
    await c.env.DB.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId).run();
    for (const r of body.roles) {
      if (!r.role) continue;
      await c.env.DB.prepare(
        "INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,?,?,'active')",
      )
        .bind(id('url'), userId, r.schoolId || null, r.role, nowIso())
        .run();
    }
  }
  const logged = { ...updates, ...(statusChange && !auth.isSuper ? { school_status: statusChange } : {}) };
  if (logged.password_hash) logged.password_hash = '[changed]';
  await audit(c, 'update', 'user', userId, { before: { status: target.status }, after: logged });
  return json({ ok: true });
});

export default tenants;
