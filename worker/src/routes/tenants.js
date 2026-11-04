import { Hono } from 'hono';
import { authMiddleware, requireRoles, hashPassword, encryptIc, hashIc, publicUser, revokeAllSessions } from '../lib/auth.js';
import { id, nowIso, readJson, bad, json, slugify, pick, normalizeIc } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { notify } from '../lib/notify.js';
import { planParent, planFailure, commitParent, linkParentToStudent } from '../lib/parents.js';

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

tenants.get('/schools', async (c) => {
  const auth = c.get('auth');
  if (auth.isSuper) {
    const { results } = await c.env.DB.prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS students,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'active') AS teachers,
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
  if (!body.name || !body.category) return bad('Nama dan kategori sekolah diperlukan. / School name and category are required.');
  if (!['tahfiz', 'islamic_studies'].includes(body.category)) return bad('Kategori tidak sah. / Invalid category.');
  if (!body.adminEmail || !body.adminName) return bad('Butiran pentadbir sekolah diperlukan. / School admin details are required.');
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
      Number(body.monthlyDueDay || 7),
      Number(body.regGenMonth || 1),
      Number(body.regGenDay || 1),
      Number(body.regDueMonth || 1),
      Number(body.regDueDay || 31),
      Number(body.monthlyFeeCents || 15000),
      Number(body.registrationFeeCents || 20000),
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
  await c.env.DB.prepare(
    'INSERT INTO fee_plans (id, school_id, name, monthly_fee_cents, registration_fee_cents, active, created_at) VALUES (?,?,?,?,?,1,?)',
  )
    .bind(id('fee'), schoolId, 'Standard', Number(body.monthlyFeeCents || 15000), Number(body.registrationFeeCents || 20000), now)
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
  await audit(c, 'create', 'school', schoolId, { after: { name: body.name, category: body.category } });
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
    if (!auth.isSuper && ['name', 'status', 'category', 'slug'].includes(f)) continue;
    updates[f] = typeof body[f] === 'number' ? body[f] : String(body[f]);
  }
  if (!Object.keys(updates).length) return bad('Tiada perubahan. / Nothing to update.');
  if (updates.monthly_due_day !== undefined) {
    const d = Number(updates.monthly_due_day);
    if (d < 1 || d > 28) return bad('Hari akhir bulanan mesti antara 1 dan 28. / Monthly due day must be 1–28.');
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
  const plans = await c.env.DB.prepare('SELECT * FROM fee_plans WHERE school_id = ?').bind(idParam).all();
  await audit(c, 'view', 'school', idParam);
  return json({ school, feePlans: plans.results });
});

tenants.get('/school-settings', async (c) => {
  const auth = c.get('auth');
  if (!auth.activeSchool) return bad('Tiada konteks sekolah. / No school context.', 400);
  const school = await c.env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(auth.activeSchool).first();
  const plans = await c.env.DB.prepare('SELECT * FROM fee_plans WHERE school_id = ?').bind(auth.activeSchool).all();
  return json({ school, feePlans: plans.results });
});

tenants.post('/school-settings/fee-plans', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (!body.name) return bad('Nama pelan diperlukan. / Plan name is required.');
  const planId = id('fee');
  await c.env.DB.prepare(
    'INSERT INTO fee_plans (id, school_id, name, monthly_fee_cents, registration_fee_cents, active, created_at) VALUES (?,?,?,?,?,1,?)',
  )
    .bind(planId, auth.activeSchool, body.name, Number(body.monthlyFeeCents || 0), Number(body.registrationFeeCents || 0), nowIso())
    .run();
  await audit(c, 'create', 'fee_plan', planId, { after: body });
  return json({ ok: true, id: planId }, 201);
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
        `SELECT ps.student_id, ps.relationship, s.full_name, s.class_name FROM parent_students ps
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
  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(body.email).first();
  if (existing) return bad('E-mel sudah digunakan. / Email already in use.', 409);
  const ic = body.ic ? await encryptIc(c.env, body.ic) : { enc: null, hash: null, masked: null };
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
  let parentPlan = null;
  if (role === 'parent') {
    parentPlan = await planParent(
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
      { schoolId },
    );
    const failure = planFailure(parentPlan);
    if (failure) return failure;
    if (parentPlan.parent?.user_id) return bad('Ibu bapa ini sudah mempunyai akaun. / This parent already has an account.', 409);
  }
  if (role === 'teacher') {
    stmts.push(
      db.prepare('INSERT INTO teachers (id, school_id, user_id, full_name, email, phone, ic_masked, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(id('tch'), schoolId, userId, body.fullName, body.email, body.phone || '', ic.masked, 'active', nowIso()),
    );
  }
  await db.batch(stmts);
  if (parentPlan) {
    const parent = await commitParent(c.env, parentPlan);
    await db.batch([
      db.prepare('UPDATE parents SET user_id = ? WHERE id = ?').bind(userId, parent.id),
      db.prepare('UPDATE users SET parent_id = ? WHERE id = ?').bind(parent.id, userId),
    ]);
    for (const sid of studentIds) await linkParentToStudent(c.env, parent.id, sid, schoolId);
    await audit(c, parentPlan.create ? 'create' : 'link', 'parent', parent.id, {
      after: { via: 'user', userId, duplicateReason: parentPlan.create?.duplicateReason || null, matchedByIc: !!parentPlan.matchedByIc },
    });
  }
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
