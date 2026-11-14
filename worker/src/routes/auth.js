import { Hono } from 'hono';
import {
  hashPassword,
  verifyUserPassword,
  isOwnIc,
  setSession,
  clearSession,
  publicUser,
  recordLoginAttempt,
  isLockedOut,
  revokeSession,
  revokeAllSessions,
  hashIc,
  encryptIc,
  decryptIc,
  SESSION_COOKIE,
} from '../lib/auth.js';
import { getCookie } from 'hono/cookie';
import { resolveAuth } from '../lib/auth.js';
import { id, nowIso, readJson, bad, json, normalizeIc, validIc } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { EMAIL_RE } from '../lib/people.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  const body = await readJson(c);
  const identifier = String(body.identifier || '').trim();
  const password = String(body.password || '');
  if (!identifier || !password) return bad('Sila masukkan e-mel/IC dan kata laluan. / Enter email/IC and password.');
  const ip = c.req.header('cf-connecting-ip') || '';
  // IC variants (spaces, hyphens, case) count as one account for the lockout.
  const account = identifier.includes('@') ? identifier.toLowerCase() : normalizeIc(identifier);
  if (await isLockedOut(c.env, account, ip)) {
    return bad('Akaun dikunci sementara kerana terlalu banyak percubaan. Cuba lagi dalam 15 minit. / Account temporarily locked. Try again in 15 minutes.', 429);
  }

  // Login ID: email, or the normalised IC / Passport No. (matched by its keyed hash).
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(identifier).first();
  if (!user && !identifier.includes('@') && validIc(identifier)) {
    const icHash = await hashIc(c.env, identifier);
    user = await c.env.DB.prepare('SELECT * FROM users WHERE ic_hash = ?').bind(icHash).first();
  }
  const ok = user ? await verifyUserPassword(c.env, user, password) : false;
  await recordLoginAttempt(c.env, account, ip, ok);
  if (!ok) return bad('Maklumat log masuk tidak sah. / Invalid login details.', 401);
  if (user.status !== 'active') return bad('Akaun dinyahaktifkan. / Account deactivated.', 403);

  const { results: roles } = await c.env.DB.prepare(
    "SELECT * FROM user_roles WHERE user_id = ? AND status = 'active' AND ended_at IS NULL",
  )
    .bind(user.id)
    .all();
  if (!roles.length) return bad('Akaun dinyahaktifkan. / Account deactivated.', 403);
  if (!roles.some((r) => r.role === 'super_admin')) {
    const ids = [...new Set(roles.map((r) => r.school_id).filter(Boolean))];
    if (ids.length) {
      const active = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM schools WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')})`,
      )
        .bind(...ids)
        .first();
      if (!active?.n) return bad('Sekolah anda telah digantung. / Your school has been suspended.', 403);
    }
  }
  let schoolId = body.schoolId || null;
  const schoolIds = roles.map((r) => r.school_id).filter(Boolean);
  if (!roles.some((r) => r.role === 'super_admin')) {
    if (!schoolId || !schoolIds.includes(schoolId)) schoolId = schoolIds[0] || null;
  }
  const token = await setSession(c, user, schoolId);
  await c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso(), user.id).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, school_id, actor_id, actor_name, actor_role, action, entity, entity_id, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(id('aud'), schoolId, user.id, user.full_name, roles[0]?.role || 'user', 'login', 'user', user.id, ip, nowIso())
    .run();
  const session = await resolveAuth(c.env, token);
  c.set('auth', session);
  return c.json({ user: publicUser(session) });
});

auth.post('/logout', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (session) await revokeSession(c.env, session.user.id, session.jti);
  clearSession(c);
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  c.set('auth', session);
  const unread = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
  )
    .bind(session.user.id)
    .first();
  return json({ user: publicUser(session), unread: unread?.n || 0 });
});

auth.post('/context', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  const body = await readJson(c);
  const schoolId = body.schoolId || null;
  if (!session.isSuper && !session.roles.some((r) => r.school_id === schoolId)) {
    return bad('Anda bukan ahli sekolah ini. / You are not a member of this school.', 403);
  }
  if (schoolId && !(await c.env.DB.prepare('SELECT 1 AS ok FROM schools WHERE id = ?').bind(schoolId).first())) {
    return bad('Sekolah tidak dijumpai. / School not found.', 404);
  }
  if (session.jti) await revokeSession(c.env, session.user.id, session.jti);
  const token = await setSession(c, session.user, schoolId);
  const renewed = await resolveAuth(c.env, token);
  return c.json({ user: publicUser(renewed) });
});

auth.patch('/profile', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  if (session.user.must_change_password) {
    return bad('Sila tukar kata laluan anda dahulu. / Please change your password first.', 403, { code: 'password_change_required' });
  }
  c.set('auth', session);
  const body = await readJson(c);
  const allowed = {};
  if (body.language === 'bm' || body.language === 'en') allowed.language = body.language;
  if (body.fullName) allowed.full_name = String(body.fullName).slice(0, 120);
  if (body.phone !== undefined) allowed.phone = String(body.phone).slice(0, 40);
  // School Admin and Super Admin may change their own login email (current password required).
  // Parent and teacher emails belong to their person records and are changed there.
  const newEmail = body.email === undefined ? null : String(body.email).trim().toLowerCase();
  if (newEmail !== null && newEmail !== String(session.user.email || '').toLowerCase()) {
    const isAdmin = session.isSuper || session.roles.some((r) => r.role === 'school_admin');
    if (!isAdmin) return bad('Hanya pentadbir boleh menukar e-mel log masuk di sini. / Only administrators can change their login email here.', 403);
    if (!EMAIL_RE.test(newEmail)) return bad('Alamat e-mel tidak sah. / Invalid email address.', 400, { code: 'email_invalid' });
    if (!(await verifyUserPassword(c.env, session.user, String(body.currentPassword || '')))) {
      return bad('Kata laluan semasa diperlukan untuk menukar e-mel. / Your current password is required to change your email.', 400, { code: 'password_required' });
    }
    const taken = await c.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').bind(newEmail, session.user.id).first();
    if (taken) return bad('E-mel ini sudah digunakan oleh akaun lain. / This email is already used by another account.', 409, { code: 'login_email_taken' });
    allowed.email = newEmail;
  }
  if (!Object.keys(allowed).length) return bad('Tiada perubahan. / Nothing to update.');
  const sets = Object.keys(allowed).map((k) => `${k} = ?`).join(', ');
  const before = { full_name: session.user.full_name, language: session.user.language, phone: session.user.phone, email: session.user.email };
  await c.env.DB.prepare(`UPDATE users SET ${sets} WHERE id = ?`)
    .bind(...Object.values(allowed), session.user.id)
    .run();
  await audit(c, 'update', 'user_profile', session.user.id, { before, after: allowed });
  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user.id).first();
  return json({ user: { ...publicUser(session), language: updated.language, name: updated.full_name, email: updated.email } });
});

auth.post('/change-password', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  c.set('auth', session);
  const body = await readJson(c);
  if (!(await verifyUserPassword(c.env, session.user, String(body.currentPassword || '')))) {
    return bad('Kata laluan semasa tidak betul. / Current password is incorrect.', 400);
  }
  const problem = await passwordProblem(c.env, session.user, body.newPassword);
  if (problem) return bad(problem, 400, { code: 'password_rule' });
  const hash = await hashPassword(String(body.newPassword));
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').bind(hash, session.user.id).run();
  await revokeAllSessions(c.env, session.user.id);
  await setSession(c, session.user, session.activeSchool);
  await audit(c, 'change_password', 'user', session.user.id, { after: { forced: !!session.user.must_change_password } });
  return c.json({ ok: true }); // c.json keeps the renewed session cookie
});

/** Password rules: at least 8 characters, and never the user's own IC / Passport No. */
async function passwordProblem(env, user, password) {
  const pw = String(password || '');
  if (pw.length < 8) return 'Kata laluan baharu mestilah sekurang-kurangnya 8 aksara. / New password must be at least 8 characters.';
  if (await isOwnIc(env, user, pw)) {
    return 'Kata laluan baharu tidak boleh sama dengan No. IC / Pasport anda. / The new password cannot be your IC / Passport No.';
  }
  return null;
}

auth.post('/forgot', async (c) => {
  const body = await readJson(c);
  const email = String(body.email || '').trim().toLowerCase();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(email).first();
  if (user) {
    const token = id('rst') + id();
    await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(
        `reset:${token}`,
        JSON.stringify({ userId: user.id, expires: Date.now() + 3600 * 1000 }),
      )
      .run();
    const appUrl = c.env.APP_URL || new URL(c.req.url).origin;
    const link = `${appUrl}/reset-password?token=${token}`;
    if (!c.env.EMAIL) {
      console.error('Password reset requested but the EMAIL binding is not configured.');
    } else {
      try {
        await c.env.EMAIL.send({
          to: user.email,
          from: c.env.MAIL_FROM || 'no_reply@mduik.org',
          subject: 'Tetapan semula kata laluan / Password reset',
          text: `Klik pautan ini untuk menetapkan semula kata laluan anda (sah 1 jam): ${link}\n\nClick this link to reset your password (valid 1 hour): ${link}`,
        });
      } catch (err) {
        console.error('reset email failed', err?.code, err?.message);
      }
    }
    // The link is only returned when explicitly enabled for local development.
    return json({ ok: true, devLink: c.env.DEV_RESET_LINKS === '1' ? link : undefined });
  }
  return json({ ok: true });
});

auth.post('/reset', async (c) => {
  const body = await readJson(c);
  const token = String(body.token || '');
  const row = await c.env.DB.prepare('SELECT * FROM settings WHERE key = ?').bind(`reset:${token}`).first();
  if (!row) return bad('Pautan tidak sah. / Invalid link.', 400);
  const data = JSON.parse(row.value);
  if (data.expires < Date.now()) return bad('Pautan telah tamat tempoh. / Link has expired.', 400);
  const target = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(data.userId).first();
  if (!target) return bad('Pautan tidak sah. / Invalid link.', 400);
  const problem = await passwordProblem(c.env, target, body.password);
  if (problem) return bad(problem, 400, { code: 'password_rule' });
  const hash = await hashPassword(String(body.password));
  // A password chosen through the reset link also ends the first-login requirement.
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').bind(hash, data.userId).run();
  await c.env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(`reset:${token}`).run();
  await revokeAllSessions(c.env, data.userId);
  return json({ ok: true });
});

export default auth;
